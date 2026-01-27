import { DEBUG } from "../utils";
export const SERVER_BASE = DEBUG ? "http://localhost:3001" : process.env.REACT_APP_API_BASE;
export const HTTPS_BASE = DEBUG ?
  process.env.REACT_APP_API_HTTPS : process.env.REACT_APP_API_BASE;

export const getStatus = async() => {
  let ret;
  try {
    const r = await fetch(`${SERVER_BASE}/api/status`);
    if (!r.ok) {
      const t = await r.text();
      console.error(`failed to get status: ${r.status} ${t.slice(0, 200)}`);
    }
    ret = r.json();
  } catch (err) {
    console.log('network error', err);
  }

  return ret;
};

export const fetchPerkCombos = async({
  weaponHash,
  sameWeaponType = false,
  sameDamageType = false,
  sameFrame = false,
  sameName = false,
  sameAmmo = false,
  newGear = false,
  leniency = 0,
} = {}) => {
  const params = new URLSearchParams({
    weaponHash: String(weaponHash),
    sameWeaponType: sameWeaponType ? "1" : "0",
    sameDamageType: sameDamageType ? "1" : "0",
    sameFrame: sameFrame ? "1" : "0",
    sameName: sameName ? "1" : "0",
    sameAmmo: sameAmmo ? "1" : "0",
    newGear: newGear ? "1" : "0",
    leniency: String(leniency),
  });

  const r = await fetch(`${SERVER_BASE}/api/perk-combos?${params.toString()}`);
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`perk-combos failed: ${r.status} ${t.slice(0, 200)}`);
  }
  return r.json();
};

export const getWeaponsList = async() => {
  const r = await fetch(`${SERVER_BASE}/api/weapons`);
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`weapons failed: ${r.status} ${t.slice(0, 200)}`);
  }
  return r.json();
};

export const getInventoryUniques = async bungieName => {
  if (bungieName.length === 0) { return ""; }

  const params = new URLSearchParams({
    bungieName,
  });

  const r = await fetch(`${HTTPS_BASE}/api/inventory-uniques?${params.toString()}`, { credentials: 'include' });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`weapons failed: ${r.status} ${t.slice(0, 200)}`);
  }
  return r.json();
};

export const getMyInventoryUniques = async() => {
  const r = await fetch(`${HTTPS_BASE}/api/inventory-uniques/me`, { credentials: 'include' });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`weapons failed: ${r.status} ${t.slice(0, 200)}`);
  }
  return r.json();
};

export const loginWithBungie = () => {
  const popup = window.open(
    `${HTTPS_BASE}/auth/bungie`,
    "bungieOAuth",
    "width=600,height=800"
  );

  return popup;
};

export const getLoginStatus = async() => {
  let ret = { loggedIn: false };
  try {
    const r = await fetch(`${HTTPS_BASE}/api/me`, { credentials: "include" });
    ret = await r.json(); // if 401, treat as logged out
  } catch (error) {
    // either cors (404) or etc, not logged in either way

    if (DEBUG) {
      console.log('/me status failed (not logged in)');
    }
  }

  return ret;
};
