// server/perkCombos.js
import Database from "better-sqlite3";
import watermarkToSeason from "./data/watermarkToSeason.json" with { type: "json" };
import weaponTypeToGunsmithOrder from "./data/weaponTypeToGunsmithOrderHash.json" with { type: "json" };
import { fetchAllPublicWeaponsByBungieName, initClient } from "./weaponFetcher.js";

const adeptTags = [
  "(Adept)", "(Timelost)"
];

const toSigned32 = hash => {
  const n = Number(hash);
  if (!Number.isFinite(n)) { throw new Error(`Invalid hash: ${hash}`); }
  // convert uint32 -> int32
  return n > 0x7fffffff ? n - 0x100000000 : n;
};

const hasMatchingNamePerkCombo = (arrayA, arrayB) => {
  const normalize = ([a, b]) => [a, b].sort().join('|');

  const setB = new Set(arrayB.map(normalize));

  return arrayA.some(pair => setB.has(normalize(pair)));
};

const bungieUrl = url => {
  return `https://www.bungie.net${url}`;
};

/**
 * Expected manifest tables in SQLite:
 * - DestinyInventoryItemDefinition
 * - DestinyPlugSetDefinition
 * - DestinySocketCategoryDefinition
 */
export const createPerkComboService = ({ db }) => {
  // ---- Prepared statements (fast) ----
  const stmtInvById = db.prepare("SELECT json FROM DestinyInventoryItemDefinition WHERE id = ?");
  const stmtPlugSetById = db.prepare("SELECT json FROM DestinyPlugSetDefinition WHERE id = ?");
  const stmtSocketCategoryById = db.prepare("SELECT json FROM DestinySocketCategoryDefinition WHERE id = ?");
  const stmtSocketTypeById = db.prepare("SELECT json FROM DestinySocketTypeDefinition WHERE id = ?");
  const stmtDamageTypeById = db.prepare("SELECT json FROM DestinyDamageTypeDefinition WHERE id = ?");
  const stmtAllWeapons = db.prepare("SELECT id, json FROM DestinyInventoryItemDefinition"); // we'll filter in JS

  // ---- In-memory caches ----
  const invCache = new Map();
  const plugSetCache = new Map();
  const socketCatCache = new Map();
  const socketTypeCache = new Map();
  const damageTypeCache = new Map();
  let weaponIndex = null; // built lazily

  const getDef = (table, id) => {
    const key = `${table}:${id}`;
    if (table === "DestinyInventoryItemDefinition") {
      if (invCache.has(key)) { return invCache.get(key); }
      const row = stmtInvById.get(toSigned32(id));
      const def = row?.json ? JSON.parse(row.json) : null;
      invCache.set(key, def);
      return def;
    }
    if (table === "DestinyPlugSetDefinition") {
      if (plugSetCache.has(key)) { return plugSetCache.get(key); }
      const row = stmtPlugSetById.get(toSigned32(id));
      const def = row?.json ? JSON.parse(row.json) : null;
      plugSetCache.set(key, def);
      return def;
    }
    if (table === "DestinySocketCategoryDefinition") {
      if (socketCatCache.has(key)) { return socketCatCache.get(key); }
      const row = stmtSocketCategoryById.get(toSigned32(id));
      const def = row?.json ? JSON.parse(row.json) : null;
      socketCatCache.set(key, def);
      return def;
    }
    if (table === "DestinySocketTypeDefinition") {
      if (socketTypeCache.has(key)) { return socketTypeCache.get(key); }
      const row = stmtSocketTypeById.get(toSigned32(id));
      const def = row?.json ? JSON.parse(row.json) : null;
      socketTypeCache.set(key, def);
      return def;
    }
    if (table === "DestinyDamageTypeDefinition") {
      if (damageTypeCache.has(key)) { return damageTypeCache.get(key); }
      const row = stmtDamageTypeById.get(toSigned32(id));
      const def = row?.json ? JSON.parse(row.json) : null;
      damageTypeCache.set(key, def);
      return def;
    }
    throw new Error(`Unknown table: ${table}`);
  };

  const getInv = hash => getDef("DestinyInventoryItemDefinition", hash);
  const getPlugSet = hash => getDef("DestinyPlugSetDefinition", hash);
  const getSocketCategory = hash => getDef("DestinySocketCategoryDefinition", hash);
  const getSocketType = hash => getDef("DestinySocketTypeDefinition", hash);
  const getDamageType = hash => getDef("DestinyDamageTypeDefinition", hash);

  // returns true if socket entry is a true weapon perk (not barrel, mag, etc)
  const isSocketEntryAWeaponPerk = socketEntry => {
    const socketType = getSocketType(socketEntry?.socketTypeHash);
    const plugWhitelist = socketType?.plugWhitelist || [];

    return plugWhitelist.filter(x => x.categoryIdentifier === "frames").length > 0;
  };

  const getOriginTraits = socketEntries => {
    // assume it's always entry #8
    const originEntry = socketEntries[8];
    if (!originEntry) { return []; }

    // weapon perk socket type.  could fetch category from this if not enough
    if (originEntry.socketTypeHash && originEntry.socketTypeHash !== 3993098925) { return []; }

    // todo: probably fine, but should probably explicitly check array size (if exists) of each in case
    //       it's possible to have both defined, in which case, maybe one array is empty and the other is not.
    //       probably not, though...
    const myPlug = originEntry?.reusablePlugSetHash ? getPlugSet(originEntry?.reusablePlugSetHash) : undefined;
    const hashList = myPlug?.reusablePlugItems || originEntry?.reusablePlugItems;

    return hashList.map(x => getPerk(x.plugItemHash, true)).filter(x => x);
  };

  // Pull plug options for a socket entry
  const getSocketPlugOptions = socketEntry => {
    const out = new Set();

    // // 1) Explicit reusablePlugItems
    // if (Array.isArray(socketEntry?.reusablePlugItems) && socketEntry.reusablePlugItems.length) {
    //   for (const p of socketEntry.reusablePlugItems) {
    //     if (p?.plugItemHash) out.add(Number(p.plugItemHash));
    //   }
    // }

    // // 2) reusablePlugSetHash
    // if (socketEntry?.reusablePlugSetHash) {
    //   const ps = getPlugSet(socketEntry.reusablePlugSetHash);
    //   const items = ps?.reusablePlugItems || [];
    //   for (const p of items) if (p?.plugItemHash) out.add(Number(p.plugItemHash));
    // }

    // 3) randomizedPlugSetHash (also a PlugSetDefinition)
    if (isSocketEntryAWeaponPerk(socketEntry) && socketEntry?.randomizedPlugSetHash) {
      const ps = getPlugSet(socketEntry.randomizedPlugSetHash);
      const items = ps?.reusablePlugItems || [];
      for (const p of items) {
        if (p?.plugItemHash && p?.currentlyCanRoll) {
          const invItem = getInv(p.plugItemHash);
          if (p.plugItemHash === 2503665585 || p.plugItemHash === 469511105) { // skip "Empty Traits Socket"
            continue;
          }
          if (invItem?.inventory.tierType > 2) { continue; } // skip enhanced perks
          out.add(Number(p.plugItemHash));
        }
      }
    }

    // remove 0 / invalid
    out.delete(0);
    return Array.from(out);
  };

  // Heuristic: select “trait column 3 and 4”
  const findTraitSocketIndexes = weaponDef => {
    const socketCats = weaponDef?.sockets?.socketCategories || [];
    const entries = weaponDef?.sockets?.socketEntries || [];

    // 1) Look for a socket category with name that contains "perk"
    for (const cat of socketCats) {
      const catHash = Number(cat.socketCategoryHash);
      const catDef = getSocketCategory(catHash);
      const catName = (catDef?.displayProperties?.name || "").toLowerCase();

      if (catName.includes("perk")) {
        // In most weapons, trait sockets are the two that matter.
        // We return the first two socketIndexes from this category that actually have plug options.
        const candidates = (cat.socketIndexes || [])
          .map(idx => Number(idx))
          .filter(idx => entries[idx])
          .filter(idx => getSocketPlugOptions(entries[idx]).length > 1);

        if (candidates.length >= 2) { return [candidates[0], candidates[1]]; }
      }
    }

    // 2) Fallback: choose the last two sockets that have >1 plug option
    // const candidates = [];
    // for (let i = 0; i < entries.length; i++) {
    //   const opts = getSocketPlugOptions(entries[i]);
    //   if (opts.length > 1) candidates.push(i);
    // }
    // if (candidates.length >= 2) {
    //   return [candidates[candidates.length - 2], candidates[candidates.length - 1]];
    // }

    return null;
  };

  const getWeaponTypeString = weaponDef =>
    weaponDef?.itemTypeDisplayName || weaponDef?.itemTypeAndTierDisplayName || "Unknown";

  const getWeaponTypeIcon = gunsmithHash => getInv(gunsmithHash)?.displayProperties?.icon;

  const getDamageTypeIndex = weaponDef => Number(weaponDef?.defaultDamageType ?? 0); // 0 unknown

  const getFrame = weaponDef => {
    // const intrinsic = weaponDef?.sockets?.intrinsicSockets?.[0]?.plugItemHash;
    // todo: maybe constrain to socket category "INTRINSIC TRAITS"
    const intrinsic = weaponDef?.sockets?.socketEntries?.[0]?.singleInitialItemHash;
    if (!intrinsic) { return "Unknown"; }
    return getInv(intrinsic);
  };

  const getFrameName = weaponDef => {
    const plugDef = getFrame(weaponDef);
    return plugDef?.displayProperties?.name;
  };

  const isWeapon = def => def?.itemType === 3; // DestinyItemType.Weapon is typically 3
  // If you ever see misses, tighten to itemCategoryHashes containing "Weapon" categories.

  const buildWeaponIndex = () => {
    if (weaponIndex) { return weaponIndex; }

    const rows = stmtAllWeapons.all();
    const list = [];

    for (const r of rows) {
      let def;
      try {
        def = JSON.parse(r.json);
      } catch {
        continue;
      }
      if (!isWeapon(def)) { continue; }
      if (!def?.equippable) { continue; }
      if (def?.redacted) { continue; }

      const traitIdxs = findTraitSocketIndexes(def);
      if (!traitIdxs) { continue; }

      const entries = def.sockets.socketEntries;
      const col3 = traitIdxs[0];
      const col4 = traitIdxs[1];

      const col3Opts = getSocketPlugOptions(entries[col3]);
      const col4Opts = getSocketPlugOptions(entries[col4]);

      if (col3Opts.length === 0 || col4Opts.length === 0) { continue; }

      const originTraits = getOriginTraits(entries);
      const weaponType = getWeaponTypeString(def);

      const images = {
        icon: bungieUrl(def.displayProperties?.icon),
        screenshot: bungieUrl(def?.screenshot),
        watermark: bungieUrl(def?.isFeaturedItem ? def?.iconWatermarkFeatured : def?.iconWatermark),
        damageType: bungieUrl(getDamageType(def.defaultDamageTypeHash)?.displayProperties?.icon),
        weaponType: bungieUrl(getWeaponTypeIcon(weaponTypeToGunsmithOrder[weaponType])),
        frame: bungieUrl(getFrame(def)?.displayProperties?.icon),
      };

      list.push({
        itemHash: Number(def.hash),
        name: def.displayProperties?.name || String(def.hash),
        images,
        season: watermarkToSeason[def?.iconWatermark],
        weaponType,
        damageType: getDamageTypeIndex(def),
        frame: getFrameName(def),
        ammoType: def.equippingBlock?.ammoType,
        // col3SocketIndex: col3,
        // col4SocketIndex: col4,
        col3Opts, col4Opts, originOpts: originTraits.map(x => x.hash),
        col3Perks: col3Opts.map(x => getPerk(x)), // plug hashes
        col4Perks: col4Opts.map(x => getPerk(x)),
        originTraits,
      });
    }

    weaponIndex = list;
    return weaponIndex;
  };

  const hasCombo = (weaponRec, perkAHash, perkBHash) => {
    // Combo exists if weapon can roll perkA in col3 AND perkB in col4
    // OR perkA in col4 AND perkB in col3
    return weaponRec.col3Opts.includes(perkAHash) && weaponRec.col4Opts.includes(perkBHash) ||
    weaponRec.col3Opts.includes(perkBHash) && weaponRec.col4Opts.includes(perkAHash);
  };

  const hasOriginCombo = (weaponRec, originHash, perkHash) => {
    // combo exists if weapon can roll the origin trait with the perk in either column
    return weaponRec.col3Opts.includes(perkHash) && weaponRec.originOpts.includes(originHash) ||
    weaponRec.col4Opts.includes(perkHash) && weaponRec.originOpts.includes(originHash);
  };

  const getPerk = (plugHash, skipEnhanced = false) => {
    const def = getInv(plugHash);

    if (skipEnhanced && def?.inventory?.tierType > 2) {
      return undefined;
    }

    return {
      name: def?.displayProperties?.name || String(plugHash),
      hash: plugHash,
      icon: bungieUrl(def?.displayProperties?.icon)
    };
  };

  const cartesianCombos = (a, b) => {
    const out = [];
    for (const x of a) { for (const y of b) { out.push([x, y]); } }
    return out;
  };

  const getUniquePlayerRolls = weapons => {
    const ret = [];

    for (const weapon of weapons) {
      // first, get all unique rolls possible on that weapon
      const allUniqueRolls = computeUniqueCombos({
        weaponHash: weapon.itemHash
      });

      if (allUniqueRolls.length === 0) { continue; }

      const playerWeaponCombos = cartesianCombos(weapon.colPerks[3].map(x => x.name), weapon.colPerks[4].map(x => x.name));

      if (hasMatchingNamePerkCombo(playerWeaponCombos, allUniqueRolls.uniqueRolls)) {
        ret.push(weapon);
      }
    }

    return ret;
  };

  /**
   * Main function: compute combos + counts
   */
  const computeUniqueCombos = ({
    weaponHash,
    sameWeaponType = false,
    sameDamageType = false,
    sameFrame = false,
    sameName = false,
    sameAmmo = false,
    newGear = false,
    leniency = 0,
  }) => {
    const index = buildWeaponIndex();

    const source = index.find(w => w.itemHash === Number(weaponHash));
    if (!source) {
      throw new Error(`Weapon hash not found or not indexable: ${weaponHash}`);
    }

    // todo: sort result perks by perk, so they don't display scattered (eg, all kill clip combos first, then etc)
    const perkCombos = cartesianCombos(source.col3Opts, source.col4Opts);

    const origin3Combos = cartesianCombos(source.originOpts, source.col3Opts);
    const origin4Combos = cartesianCombos(source.originOpts, source.col4Opts);

    const results = [];
    const originResults = [];

    const comboSets = [perkCombos, origin3Combos, origin4Combos];

    for (let i = 0; i < comboSets.length; i++) {
      const combos = comboSets[i];

      const isOriginComparison = i > 0;
      const comparisonFunc = isOriginComparison ? hasOriginCombo : hasCombo;
      const arr = isOriginComparison ? originResults : results;

      for (const [perk3, perk4] of combos) {
        let countOther = 0;
        const matches = []; // optional list of weapon hashes; can omit for speed

        for (const w of index) {
          if (w.itemHash === source.itemHash) { continue; }

          let sourceStr = source.name;
          let wStr = w.name;

          let isAdept = false;
          for (const tag of adeptTags) {
            if (source.name.includes(tag)) {
              isAdept = true;
              sourceStr = sourceStr.replace(tag, "").trim();
            }
            if (w.name.includes(tag)) {
              wStr = wStr.replace(tag, "").trim();
            }
            if (isAdept) { break; }
          }

          // comparing weapons with the same name, so either a revision or an adept
          if (sourceStr === wStr) {
            const sourceCol3PerkStr = source.col3Perks.map(x => x.name).join("-");
            const sourceCol4PerkStr = source.col4Perks.map(x => x.name).join("-");

            const wCol3PerkStr = w.col3Perks.map(x => x.name).join("-");
            const wCol4PerkStr = w.col4Perks.map(x => x.name).join("-");

            if (sourceCol3PerkStr === wCol3PerkStr && sourceCol4PerkStr === wCol4PerkStr) {
              // same name, same perks, likely an adept, skip
              continue;
            } else if (!sameName) {
              // same name, different perks, likely a revised weapon
              continue;
            }
          }

          if (sameWeaponType && w.weaponType !== source.weaponType) { continue; }
          if (sameDamageType && w.damageType !== source.damageType) { continue; }
          if (sameFrame && w.frame !== source.frame) { continue; }
          if (sameAmmo && w.ammoType !== source.ammoType) { continue; }
          if (newGear && !w.isFeaturedItem) { continue; }

          if (comparisonFunc(w, perk3, perk4)) {
            countOther++;
            matches.push(w.itemHash);
            // stop early if above leniency
            if (countOther > Number(leniency)) { break; }
          }
        }

        const perk3Def = getPerk(perk3);
        const perk4Def = getPerk(perk4);

        let perkTuple = {
          perk3: { hash: perk3, ...perk3Def },
          perk4: { hash: perk4, ...perk4Def },
        };

        // reordering so origin combos show up as [origin, perk] on front-end
        if (isOriginComparison) {
          perkTuple = {
            perk3: { hash: perk4, ...perk4Def },
            perk4: { hash: perk3, ...perk3Def },
          };
        }

        arr.push({
          ...perkTuple,
          countOther,
          isUniqueWithinLeniency: countOther <= Number(leniency),
          exampleOtherWeaponHashes: matches.slice(0, 10),
        });
      }
    }

    // sort by rarity/uniqueness
    results.sort((a, b) => a.countOther - b.countOther);
    originResults.sort((a, b) => a.countOther - b.countOther);

    return {
      source: {
        itemHash: source.itemHash,
        name: source.name,
        weaponType: source.weaponType,
        damageType: source.damageType,
        frame: source.frame,
        // col3SocketIndex: source.col3SocketIndex,
        // col4SocketIndex: source.col4SocketIndex,
        // col3PerkCount: source.col3Opts.length,
        // col4PerkCount: source.col4Opts.length,
      },
      // filters: { sameWeaponType, sameDamageType, sameFrame, leniency: Number(leniency) },
      results,
      // numTotalCombos: results.length,
      // numUniqueCombos: results.filter(x => x.isUniqueWithinLeniency).length,
      uniqueRolls: results.filter(x => x.isUniqueWithinLeniency).map(x => [x.perk3.name, x.perk4.name]),
      // commonRolls: results.filter(x => !x.isUniqueWithinLeniency).map(x => [x.perk3.name, x.perk4.name]),
      originResults,
    };
  };

  const callInventory = async({ bungieName, accessToken, membershipId }) => {
    initClient(accessToken);
    const { weapons } = await fetchAllPublicWeaponsByBungieName({
      bungieName,
      membershipId,
      getItemDef: getInv
    });

    const uniques = getUniquePlayerRolls(weapons);
    const dimStr = `id:${uniques.map(x => x.instanceId).join(" or id:")}`;

    return {
      success: true,
      amount: uniques.length,
      text: dimStr
    };
  };

  const status = () => {
    if (!weaponIndex) {
      return false;
    }

    return true;
  };

  return { buildWeaponIndex, computeUniqueCombos, callInventory, status };
};
