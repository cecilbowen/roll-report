export const STATUS_RETRY = 200;
export const STATUS_RETRY_LIMIT = 10;
export const DEBUG = process.env.REACT_APP_DEBUG === "true";
export const FILTER_OUT_ACCELERATED_ASSAULT_CLONES = true;

// spiderman point meme d2 emote equivalent
const mirrorMirrorEmoteIcon = "https://www.bungie.net/common/destiny2_content/icons/a3794cf6feabce9c5925db522eca32b3.jpg";
const avantGardeIcon = "https://www.bungie.net/common/destiny2_content/icons/85104c7ab5179093b459dc0ebef2228b.png";

const ACCELERATED_ASSAULT_IDS = [3713579091, 2697390518];

// todo: later on post-release, >>MAYBE<< just choose random, current season, new-gear weapon
//       instead of some of my personal picks below
export const weaponPerDay = {
  1: 2979764077, // No Feelings
  2: 1541324871, // Refusal of the Call
  3: 3418719964, // Long Arm
  4: 950894542, // Threat Level
  5: 3961462214, // Kindled Orchid
  6: 1700366811, // Unworthy
  0: 189854537 // The Slammer
};

export const damageTypeMap = {
  1: "Kinetic",
  2: "Arc",
  3: "Solar",
  4: "Void",
  5: "Raid",
  6: "Stasis",
  7: "Strand"
};

export const ammoTypeMap = {
  1: "Primary",
  2: "Special",
  3: "Heavy"
};

export const ammoTypeImgMap = {
  1: "https://www.bungie.net/common/destiny2_content/icons/99f3733354862047493d8550e46a45ec.png",
  2: "https://www.bungie.net/common/destiny2_content/icons/d920203c4fd4571ae7f39eb5249eaecb.png",
  3: "https://www.bungie.net/common/destiny2_content/icons/78ef0e2b281de7b60c48920223e0f9b1.png"
};

export const getRandomFeaturedWeaponHash = weapons => {
  if (!weapons) { return undefined; }
  const justFeatureds = weapons.filter(x => x.isFeaturedItem);
  return justFeatureds[~~(justFeatureds.length * Math.random())]?.itemHash;
};

export const getFilterDesc = (name, weapon) => {
  const desc = {
    sameType: `Narrow weapon scope to only ${weapon?.weaponType}s`,
    sameDamage: `Narrow damage type scope to only ${damageTypeMap[weapon?.damageType]}`,
    sameFrame: `Narrow frame scope to only ${weapon?.frame}s`,
    sameAmmo: `Narrow ammo scope to only ${ammoTypeMap[weapon?.ammoType]} ammo`,
    newGear: "Narrow gear scope to only Featured Gear",
    sameName: "Treat same-name weapon re-issues as different weapons"
  };

  return desc[name];
};

export const getFilterIcon = (name, weapon) => {
  const icons = {
    sameType: weapon?.images?.weaponType,
    sameDamage: weapon?.images?.damageType,
    sameFrame: weapon?.images?.frame,
    sameAmmo: ammoTypeImgMap[weapon?.ammoType],
    newGear: avantGardeIcon,
    sameName: mirrorMirrorEmoteIcon
  };

  return icons[name];
};

export const getWrappedIndex = (arr, index) => {
  if (!Array.isArray(arr) || arr.length === 0) { return index; }
  return index % arr.length;
};

const fallbackCopyTextToClipboard = text => {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const successful = document.execCommand('copy');
    const msg = successful ? 'successful' : 'unsuccessful';
    console.log(`Fallback: Copying text command was ${ msg}`);
  } catch (err) {
    console.error('Fallback: Oops, unable to copy', err);
  }

  document.body.removeChild(textArea);
};

export const copyTextToClipboard = text => {
  if (!navigator.clipboard) {
    fallbackCopyTextToClipboard(text);
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    console.log('Async: Copying to clipboard was successful!');
    window.snackbar.createSnackbar(
        'Copied to clipboard!', { timeout: 3000 }
    );
  }, err => {
    console.error('Async: Could not copy text: ', err);
  });
};

export const getSpaceToViewportBottom = elementId => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error('Element not found');
    return null;
  }

  const rect = element.getBoundingClientRect();
  const distanceToViewportTop = rect.top;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const heightToBottom = viewportHeight - distanceToViewportTop;

  return heightToBottom;
};

export const getSpaceToWindowBottom = elementId => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error("Element not found!");
    return null;
  }

  const rect = element.getBoundingClientRect();
  const elementTopInViewport = rect.top;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const elementTopInDocument = elementTopInViewport + scrollTop;

  const documentHeight = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight,
    document.body.offsetHeight,
    document.documentElement.offsetHeight,
    document.body.clientHeight,
    document.documentElement.clientHeight
  );

  const distance = documentHeight - elementTopInDocument;

  return distance;
};

export const getSearchParam = (key, url = window.location.href) => {
  return new URL(url).searchParams.get(key);
};

export const setSearchParam = (key, value, { replace = true } = {}) => {
  const url = new URL(window.location.href);

  if (value === null || value === undefined) {
    url.searchParams.delete(key);
  } else {
    url.searchParams.set(key, value);
  }

  window.history[replace ? "replaceState" : "pushState"](
    {},
    "",
    url.toString()
  );
};

export const getNonEmptyArray = (arr1, arr2) => {
  if (Array.isArray(arr1) && arr1.length > 0) { return arr1; }
  if (Array.isArray(arr2) && arr2.length > 0) { return arr2; }
  return undefined;
};

const arraysMatch = (array1 = [], array2 = []) => {
  const first = [...new Set(array1)].sort();
  const second = [...new Set(array2)].sort();

  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
};

const isAcceleratedAssaultClone = (weapon, otherWeapon) => {
  if (weapon.name !== otherWeapon.name) {
    return false;
  }

  if (!arraysMatch(weapon.col3Opts, otherWeapon.col3Opts)) {
    return false;
  }

  if (!arraysMatch(weapon.col4Opts, otherWeapon.col4Opts)) {
    return false;
  }

  const weaponHasAcceleratedAssault =
    weapon.originOpts.some(id => ACCELERATED_ASSAULT_IDS.includes(id));

  const otherHasAcceleratedAssault =
    otherWeapon.originOpts.some(id => ACCELERATED_ASSAULT_IDS.includes(id));

  // Exactly one of the two must have Accelerated Assault.
  if (weaponHasAcceleratedAssault === otherHasAcceleratedAssault) {
    return false;
  }

  const weaponOriginsWithoutAA = weapon.originOpts.filter(
    id => !ACCELERATED_ASSAULT_IDS.includes(id)
  );

  const otherOriginsWithoutAA = otherWeapon.originOpts.filter(
    id => !ACCELERATED_ASSAULT_IDS.includes(id)
  );

  // After removing Accelerated Assault, the origin-trait pools must match.
  return arraysMatch(
    weaponOriginsWithoutAA,
    otherOriginsWithoutAA
  );
};

export const removeNonAcceleratedAssaultClones = weapons =>
  weapons.filter((weapon, weaponIndex) => {
    const hasAcceleratedAssault =
      weapon.originOpts.some(id => ACCELERATED_ASSAULT_IDS.includes(id));

    // Never remove the Accelerated Assault version.
    if (hasAcceleratedAssault) {
      return true;
    }

    const hasAcceleratedClone = weapons.some(
      (otherWeapon, otherIndex) =>
        weaponIndex !== otherIndex &&
        otherWeapon.originOpts.some(id => ACCELERATED_ASSAULT_IDS.includes(id)) &&
        isAcceleratedAssaultClone(weapon, otherWeapon)
    );

    return !hasAcceleratedClone;
  });