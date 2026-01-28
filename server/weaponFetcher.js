import { formatDate } from "./util";

const BUNGIE_API_BASE = "https://www.bungie.net/Platform";

const PROFILE_COMPONENTS = [
  100, // Profiles
  200, // Characters
  102, // ProfileInventories (Vault buckets live here)
  201, // CharacterInventories (includes postmaster if privacy allows)
  205, // CharacterEquipment
  300, // ItemInstances (optional)
  305, // ItemSockets (optional)
  310 // ItemReusablePlugs
];

const POSTMASTER_BUCKET_HASH = 215593132;
const isPostmasterItem = item => item?.bucketHash === POSTMASTER_BUCKET_HASH;

let client;
// let accessToken;

export const initClient = accessToken => {
  // if (!client) {
    client = makeD2Client(accessToken);
  // }
};

const makeD2Client = accessToken => {
  const apiKey = process.env.BUNGIE_API_KEY;
  if (!apiKey) { throw new Error("apiKey is required"); }

  const request = async(path, { method = "GET", body } = {}) => {
    const headers = {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    };

    if (!accessToken) {
      delete headers.Authorization;
    }

    const res = await fetch(`${BUNGIE_API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response for ${path}: ${text.slice(0, 200)}`);
    }

    if (!res.ok || json.ErrorCode !== 1) {
      throw new Error(`Bungie error for ${path}: ${json.ErrorStatus} - ${json.Message}`);
    }

    if (!("Response" in json)) {
      throw new Error(`No Response field for ${path}. Keys: ${Object.keys(json).join(", ")}`);
    }

    return json.Response;
  };

  return { request };
};

const parseBungieName = bungieName => {
  // Accept "Name#1234"
  const idx = bungieName.lastIndexOf("#");
  if (idx <= 0 || idx === bungieName.length - 1) {
    throw new Error(`Invalid Bungie Name format. Expected "Name#1234", got: ${bungieName}`);
  }
  return {
    displayName: bungieName.slice(0, idx),
    displayNameCode: Number(bungieName.slice(idx + 1)),
  };
};

const getMembershipFromId = async({ membershipId }) => {
  const url = `/User/GetMembershipsById/${membershipId}/-1/`;
  const response = await client.request(url);

  if (!response?.destinyMemberships) {
    throw new Error(`No Destiny memberships found for ${membershipId}`);
  }

  const idToCheck = response?.primaryMembershipId;

  const membership = {};

  let primaryIdFound = false;

  if (idToCheck) {
    const foundType = response?.destinyMemberships?.filter(x => x.membershipId === idToCheck)?.[0]?.membershipType;
    membership.membershipType = foundType;
    membership.membershipId = idToCheck;

    if (foundType) {
      primaryIdFound = true;
    }
  } else {
    membership.membershipType = response?.destinyMemberships?.[0]?.membershipType;
    membership.membershipId = response?.destinyMemberships?.[0]?.membershipId;
  }

  if (!primaryIdFound && response?.destinyMemberships?.length > 1) {
    console.warn(`[${formatDate()}]: >1 destiny memberships but no primaryMembershipId (weird?) - membershipId: ${membershipId}`);
  }

  return membership;
};

const searchDestinyPlayerByBungieName = async({ bungieName, membershipType = -1 }) => {
  const { displayName, displayNameCode } = parseBungieName(bungieName);

  // MembershipType:
  // -1 = all (recommended)
  // Otherwise you can pass 1/2/3/... but -1 is easiest for "just find them".
  const url =
    `/Destiny2/SearchDestinyPlayerByBungieName/${membershipType}/` +
    `?displayName=${encodeURIComponent(displayName)}&displayNameCode=${encodeURIComponent(displayNameCode)}`;

  const response = await client.request(url, { method: "POST", body: { displayName, displayNameCode } });

  // Usually an array of memberships; pick the first (or you can pick based on cross-save)
  if (!Array.isArray(response) || response.length === 0) {
    throw new Error(`No Destiny memberships found for ${bungieName}`);
  }

  // Each element typically includes membershipType and membershipId.
  // If you want to prefer cross-save primary, you can add selection logic later.
  return response[0];
};

const getProfile = async({ membershipType, membershipId, components = PROFILE_COMPONENTS }) => {
  const url =
    `/Destiny2/${membershipType}/Profile/${membershipId}/` +
    `?components=${components.join(",")}`;

  return client.request(url);
};

const extractAllItemsIncludingVault = profile => {
  const charData = profile?.characters?.data || {};
  const invData = profile?.characterInventories?.data || {};
  const eqData = profile?.characterEquipment?.data || {};
  const profileInv = profile?.profileInventory?.data?.items || []; // component 102

  const characterIds = Object.keys(charData);
  const all = [];

  // Vault/profile-level inventory
  for (const item of profileInv) {
    all.push({ ...item, characterId: null, source: "profileInventory" }); // vault lives here
  }

  // Per-character inventory + equipped
  for (const characterId of characterIds) {
    const invItems = invData[characterId]?.items || [];
    const eqItems = eqData[characterId]?.items || [];

    for (const item of invItems) { all.push({ ...item, characterId, source: "characterInventory" }); }
    for (const item of eqItems) { all.push({ ...item, characterId, source: "characterEquipment" }); }
  }

  return { characterIds, items: all };
};

/**
 * Filter to weapons using manifest definitions.
 * This is the cleanest way because buckets alone miss edge cases.
 *
 * Weapon test:
 *   itemDef?.itemType === 3  (DestinyItemType.Weapon)
 *
 * Returns a normalized list you can feed into your "unique roll" logic.
 */
const filterAndNormalizeWeapons = ({ items, getItemDef, profile }) => {
  const instances = profile?.itemComponents?.instances?.data || {};
  const sockets = profile?.itemComponents?.sockets?.data || {}; // only present if you requested component 305
  const reusablePlugs = profile?.itemComponents?.reusablePlugs?.data || {};

  const weapons = [];

  for (const item of items) {
    const itemHash = item?.itemHash;
    if (!itemHash) { continue; }

    const def = getItemDef?.(itemHash);
    if (!def) { continue; } // if your manifest cache is missing, skip (or handle differently)

    // DestinyItemType.Weapon === 3
    if (def.itemType !== 3) { continue; }

    // skip exotic weapons
    if (def.inventory?.tierType === 6) { continue; }

    // Some items can be "redacted" for privacy/unknown reasons; skip those
    if (def.redacted) { continue; }

    const instanceId = item?.itemInstanceId || null;

    let weaponPlugs;
    const columns = {};
    const colPerks = {};
    if (instanceId) {
        weaponPlugs = reusablePlugs[instanceId]?.plugs;
        if (weaponPlugs) {
            const col3Plugs = weaponPlugs[3];
            const col4Plugs = weaponPlugs[4];

            const randomRolls = def?.sockets?.socketEntries?.[3]?.randomizedPlugSetHash ||
              def?.sockets?.socketEntries?.[4]?.randomizedPlugSetHash;
            if (!randomRolls) { continue; }

            const plugList = [col3Plugs, col4Plugs];
            for (let i = 0; i < plugList.length; i++) {
                const list = plugList[i];
                if (!list) { continue; }
                const colNum = i + 3;
                for (const plug of list) {
                    if (plug?.canInsert) {
                        colPerks[colNum] = colPerks[colNum] || [];
                        const itemDef = getItemDef?.(plug?.plugItemHash);
                        colPerks[colNum].push({
                            name: itemDef?.displayProperties?.name,
                            hash: itemDef?.hash
                        });
                    }
                }
            }
        } else {
            continue;
        }
    }

    weapons.push({
      // identity
      itemHash,
      instanceId,

      // where it came from
      // characterId: item.characterId,
      // source: item.source,

      // quantities / state
      // quantity: item.quantity ?? 1,
      // state: item.state ?? 0,
      // location: item.location ?? null,
      // bucketHash: item.bucketHash ?? null,

      // helpful definition fields (for display/debug)
      name: def.displayProperties?.name ?? "(unknown)",
      // icon: def.displayProperties?.icon ?? null,
      // itemSubType: def.itemSubType ?? null,
      // itemCategoryHashes: def.itemCategoryHashes ?? [],

      // optional: instance + sockets (only if available)
      instance: instanceId ? instances[instanceId] || null : null,
      sockets: instanceId ? sockets[instanceId] || null : null,
      colPerks
    });
  }

  return weapons;
};

export const fetchAllPublicWeaponsByBungieName = async({
  bungieName,
  membershipId,
  membershipType = -1,
  components = PROFILE_COMPONENTS,
  getItemDef,
}) => {
  const apiKey = process.env.BUNGIE_API_KEY;
  if (!apiKey) { throw new Error("Missing apiKey"); }
  if (!bungieName && !membershipId) { throw new Error("Missing bungieName and no membershipId"); }
  if (typeof getItemDef !== "function") {
    throw new Error("Missing getItemDef(itemHash) manifest lookup function");
  }

  let membership = {
    membershipType,
    membershipId,
  };

  if (membershipId) {
    // this is likely from authorized session, so we don't need bungieName in this case
    membership = await getMembershipFromId({ membershipId });
  }

  if (!membershipId || membership.membershipType === -1) {
    membership = await searchDestinyPlayerByBungieName({ bungieName, membershipType });
  }

  const profile = await getProfile({
    membershipType: membership.membershipType,
    membershipId: membership.membershipId,
    components,
  });

  const { items } = extractAllItemsIncludingVault(profile);
  const weapons = filterAndNormalizeWeapons({ items, getItemDef, profile });

  // (Optional) de-dupe by instanceId (some items can appear in multiple lists in weird cases)
  const seen = new Set();
  const deduped = [];
  for (const w of weapons) {
    const key = w.instanceId ? `i:${w.instanceId}` : `h:${w.itemHash}|c:${w.characterId}|s:${w.source}`;
    if (seen.has(key)) { continue; }
    seen.add(key);
    deduped.push(w);
  }

  // accessToken = undefined; // todo: re-position later
  return {
    membershipType: membership.membershipType,
    membershipId: membership.membershipId,
    bungieName,
    weapons: deduped,
  };
};
