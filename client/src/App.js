import './App.css';
import pkg from "../package.json";
import { useEffect, useState } from "react";
import {
  fetchPerkCombos, getWeaponsList, getInventoryUniques,
  getStatus, loginWithBungie, NGROK_BASE, getMyInventoryUniques,
  getLoginStatus
} from "./d2/perkComboClient";
import DimModal from './components/DimModal';
import useWindowSize from './hooks/useWindowSize';
import Loading from './components/Loading';
import { getSearchParam, setSearchParam } from './utils';

const PANEL_LIMIT = 10; // how many weapons to list in the search results panel
const STATUS_RETRY = 200;
const STATUS_RETRY_LIMIT = 10;

const damageTypeMap = {
  1: "Kinetic",
  2: "Arc",
  3: "Solar",
  4: "Void",
  5: "Raid",
  6: "Stasis",
  7: "Strand"
};

const ammoTypeMap = {
  1: "Primary",
  2: "Special",
  3: "Heavy"
};

const ammoTypeImgMap = {
  1: "https://www.bungie.net/common/destiny2_content/icons/99f3733354862047493d8550e46a45ec.png",
  2: "https://www.bungie.net/common/destiny2_content/icons/d920203c4fd4571ae7f39eb5249eaecb.png",
  3: "https://www.bungie.net/common/destiny2_content/icons/78ef0e2b281de7b60c48920223e0f9b1.png"
};

// todo: later on post-release, >>MAYBE<< just choose random, current season, new-gear weapon
//       instead of one of my personal picks below
const weaponPerDay = {
  1: 2883684343, // Hung Jury SR4 (Adept)
  2: 1354727549, // The Slammer (Adept)
  3: 3019024381, // The Prophet (Adept)
  4: 3981920134, // Aureus Neutralizer
  5: 2575506895, // Kindled Orchid
  6: 2226158470, // Unworthy
  7: 1039915310 // Non-Denouement (Adept)
};

const App = () => {
  const [statusGood, setStatusGood] = useState(false);
  const [statusCounter, setStatusCounter] = useState(0);
  const [membershipId, setMembershipId] = useState(); // if set, logged in
  const [oauthDisabled, setOauthDisabled] = useState(false);

  const [weaponHash, setWeaponHash] = useState();
  const [searchText, setSearchText] = useState("");
  const [selectedWeapon, setSelectedWeapon] = useState();

  // filters
  const [sameType, setSameType] = useState(false);
  const [sameDamage, setSameDamage] = useState(false);
  const [sameFrame, setSameFrame] = useState(false);
  const [sameName, setSameName] = useState(false);
  const [sameAmmo, setSameAmmo] = useState(false);
  const [newGear, setNewGear] = useState(false);

  const [leniency, setLeniency] = useState(0);
  const [weapons, setWeapons] = useState([]);
  const [filteredWeapons, setFilteredWeapons] = useState([]);
  const [searching, setSearching] = useState(false);
  const [perkResults, setPerkResults] = useState();
  const [originResults, setOriginResults] = useState();
  const [modalShowing, setModalShowing] = useState(false);
  const [dim, setDim] = useState();
  const [fetchingDim, setFetchingDim] = useState(false);
  const [wallpaper, setWallpaper] = useState("blank.png");
  const [perkTab, setPerkTab] = useState("basic"); // basic, origin
  const { width, height } = useWindowSize();
  const [popup, setPopup] = useState();

  const checkLogin = () => {
    getLoginStatus().then(esta => {
      if (esta.oauthEnabled === false) {
        console.warn("The server currently has Bungie OAuth disabled.");
        setOauthDisabled(true);
      } else if (esta.loggedIn) {
        console.log("Already logged in via Bungie.net");
        setMembershipId(esta.bungieMembershipId);
      }
    });
  };

  const pollStatus = () => {
    if (statusCounter > STATUS_RETRY_LIMIT) {
      console.error("failed to reach server");
      return;
    }

    getStatus().then(rsp => {
      if (!rsp) {
        setStatusCounter(statusCounter + 1);
      } else {
        setStatusCounter(0);
        setStatusGood(true);
        checkLogin();
      }
    });
  };

  useEffect(() => {
    pollStatus();
  }, []);

  useEffect(() => {
    setFetchingDim(false);
    console.log("dim", dim);
  }, [dim]);

  useEffect(() => {
    if (modalShowing) {
      checkLogin();
    } else {
      setDim(undefined);
      setFetchingDim(false);
    }
  }, [modalShowing]);

  useEffect(() => {
    if (statusCounter > 0) {
      setTimeout(() => pollStatus(), STATUS_RETRY);
    }
  }, [statusCounter]);

  useEffect(() => {
    if (statusGood) {
      console.log("Server found!");
      if (weapons.length === 0) {
        getWeaponsList().then(rsp => {
          setWeapons(rsp);
          console.log("weapons", rsp);
        });
      }
      // window.bungo = getInventoryUniques;
    }
  }, [statusGood]);

  useEffect(() => {
    if (weapons.length > 0) {
      const urlWeapon = getSearchParam("id");
      const potHash = Number(urlWeapon);
      if (!isNaN(potHash) && weapons.filter(x => x.itemHash === potHash).length > 0) {
        setWeaponHash(potHash);
      } else {
        setWeaponHash(weaponPerDay[new Date().getDay()]);
      }
    }
  }, [weapons]);

  useEffect(() => {
    if (searchText) {
      const filtereds = weapons.filter(x => x.name.toLowerCase().includes(searchText.toLowerCase()));
      filtereds.sort((a, b) => {
        const nameComparison = a.name.localeCompare(b.name);

        if (nameComparison !== 0) {
          return nameComparison;
        }

        return a.season - b.season;
      });
      setFilteredWeapons(filtereds.slice(0, PANEL_LIMIT - 1));
    } else {
      setFilteredWeapons([]);
    }
  }, [searchText]);

  useEffect(() => {
    if (weaponHash) {
      checkPerks();
    }
  }, [
    weaponHash, sameType, sameDamage,
    sameFrame, sameName, sameAmmo, newGear,
    leniency
  ]);

  useEffect(() => {
    if (!searching && selectedWeapon) {
      setSearchText(selectedWeapon?.name);
    }
  }, [searching]);

  useEffect(() => {
    let imgUrl = "blank.png";
    if (selectedWeapon) {
      console.log("selectedWeapon", selectedWeapon);
      setSearchText(selectedWeapon?.name);
      setPerkTab("basic");
      imgUrl = selectedWeapon?.images?.screenshot;
      setSearchParam("id", selectedWeapon?.itemHash);
    }

    setWallpaper(imgUrl);
  }, [selectedWeapon]);

  const clearDim = () => {
    setDim({ fail: true });
    setFetchingDim(false);
  };

  const checkPerks = () => {
    setSelectedWeapon(weapons.filter(x => x.itemHash === weaponHash)[0]);
    run();
  };

  const bungoLogin = () => {
    setFetchingDim(true);
    if (!membershipId) {
      window.addEventListener("message", async event => {
        if (event.origin !== NGROK_BASE) { return; }

        if (event.data === "bungie-auth-success") {
          popup?.close();
          setPopup(undefined);
          setMembershipId("1"); // todo replace with actual membershipId (not needed now, just pseudo boolean)

          getMyInventoryUniques().then(rsp => {
            if (rsp?.success) {
              console.log("successfully pulled authenticated inv!");
              setDim({
                text: rsp.text,
                amount: rsp.amount,
              });
            }
          }).catch(err => {
            console.log("error getting uniques after successful oauth", err);
            clearDim();
          });
        }
      });

      const newPopup = loginWithBungie();
      setPopup(newPopup);
    } else {
      getMyInventoryUniques().then(rsp => {
        if (rsp?.success) {
          console.log("successfully pulled authenticated inv!");
          setDim({
            text: rsp.text,
            amount: rsp.amount
          });
        }
      }).catch(err => {
        console.error("error getting uniques with non-expired session", err);
        clearDim();
      });
    }
  };

  const updateLeniency = (value, isBlur) => {
    if (isNaN(value) || value < 0 || isBlur && value.length === 0) {
      setLeniency(0);
      return;
    }

    setLeniency(Number(value));
  };

  const run = async() => {
    const data = await fetchPerkCombos({
      weaponHash: Number(weaponHash),
      sameWeaponType: sameType,
      sameDamageType: sameDamage,
      sameFrame,
      sameName,
      leniency: Math.max(0, Number(leniency)),
    });

    console.log("PERK COMBO RESULTS:", data);
    setPerkResults(data?.results);
    setOriginResults(data?.originResults);
  };

  const queueDimQuery = bungieName => {
    if (fetchingDim || !bungieName) { return; }

    setFetchingDim(true);
    getInventoryUniques(bungieName).then(rsp => {
      if (rsp?.success) {
        console.log("dim query complete");
        setDim({
          text: rsp.text,
          amount: rsp.amount
        });
      }
    }).catch(err => {
      console.error("error fetching dim query", err);
      clearDim();
    });
  };

  const renderSearchPanel = () => {
    if (!searching) { return null; }

    const searchBox = document.getElementById("searchText");
    const rect = searchBox.getBoundingClientRect();

    return <div className="search-panel"
      style={{
        top: `calc(${rect.top}px + ${rect.height}px + 4px)`,
        left: `calc(${rect.left}px - 4px)`,
        width: `calc(${rect.width}px + 6px)`
      }}>
      {filteredWeapons.map(weapon => {
        return <div key={weapon.itemHash} className="weapon-label" onClick={() => setWeaponHash(weapon.itemHash)}>
          <div className="weapon-icon-holder">
            <img className="weapon-icon" alt={weapon?.name} src={weapon?.images?.icon}></img>
            <div className="weapon-element-shadow"></div>
            <img className={`damage-type-icon-${weapon.damageType}`}
              alt={weapon?.damageType} src={weapon?.images?.damageType}></img>
            <img className="weapon-watermark" alt={"season"} src={weapon?.images?.watermark}></img>
          </div>
          <span>{`${weapon?.name} | Season ${weapon?.season} | ${weapon?.itemHash}`}</span>
        </div>;
      })}
    </div>;
  };

  const renderPerkCombos = () => {
    if (!perkResults && !originResults) { return null; }

    const set = perkTab === "basic" ? perkResults : originResults;
    const results = set.filter(x => x.isUniqueWithinLeniency);
    const none = (selectedWeapon?.originTraits?.length || 0) === 0 &&
      results.length === 0;

    const basicNum = perkResults?.filter(x => x.isUniqueWithinLeniency)?.length ?? 0;
    const originNum = originResults?.filter(x => x.isUniqueWithinLeniency)?.length ?? 0;

    const perkText = width > 500 ? "Unique Perk Combos" : "Unique";
    const originText = width > 500 ? "Unique Origin Combos" : "Origin";

    return <div className="perk-combos">
      <div className="perk-tabs">
        {results.length > 0 && <div className="perk-section" onClick={() => setPerkTab("basic")}>
          <div title="[column 3, column 4] combos"
            className={`perk-section-text ${perkTab === 'basic' || 'perk-tab-inactive'}`}>
            {perkText}{` (${basicNum})`}
          </div>
        </div>}
        {selectedWeapon?.originTraits?.length > 0 && <div className="perk-section" onClick={() => setPerkTab("origin")}>
          <div title="[column 3/4, origin trait] combos"
            className={`perk-section-text ${perkTab === 'origin' || 'perk-tab-inactive'}`}>
            {originText}{` (${originNum})`}
          </div>
        </div>}
        <div className="tab-stand"></div>
      </div>
      {!none && <hr className="solid"></hr>}
      {none && <div className="no-results">
        No combos found
      </div>}
      <div className="combo-container-container">
        <div id="theCombos" className="combo-container">
          <div className="perks">
            {results.map(result => {
              return <div key={`${result.perk3.hash}-${result.perk4.hash}`} className="perk-combo">
                <img className="perk-icon noselect" src={result.perk3.icon} alt={result.perk3.name} title={result.perk3.name}></img>
                <img className="perk-icon noselect" src={result.perk4.icon} alt={result.perk4.name} title={result.perk4.name}></img>
              </div>;
            })}
          </div>
        </div>
      </div>
    </div>;
  };

  const renderPerk = perk => {
    return <div key={`${perk.hash}`} className="perk-single">
      <img className="perk-icon-single noselect" src={perk.icon} alt={perk.name} title={perk.name}></img>
    </div>;
  };

  const renderAllPerks = () => {
    if (!selectedWeapon) { return null; }

    return <div className="all-perks">
      <div className="col-container">
        <div id="thePerks" className="perks-columns">
          <div className="left-col">{selectedWeapon.col3Perks.map(x => renderPerk(x))}</div>
          <div className="right-col">{selectedWeapon.col4Perks.map(x => renderPerk(x))}</div>
          {selectedWeapon?.originTraits?.length > 0 &&
            <div className="right-col">{selectedWeapon.originTraits.map(x => renderPerk(x))}</div>}
        </div>
      </div>

      {renderPerkCombos()}
    </div>;
  };

  const renderOptions = () => {
    if (!selectedWeapon) { return null; }

    // spiderman point meme d2 emote equivalent
    const mirrorMirrorEmoteIcon = "https://www.bungie.net/common/destiny2_content/icons/a3794cf6feabce9c5925db522eca32b3.jpg";
    const avantGardeIcon = "https://www.bungie.net/common/destiny2_content/icons/85104c7ab5179093b459dc0ebef2228b.png";
    const modalIconTitle = "Check your gear for unique rolls";

    return <div className="options">
      <label className="checkbox-holder" title={`Narrow weapon scope to only ${selectedWeapon?.weaponType}s`}>
        <input type="checkbox" checked={sameType} onChange={e => setSameType(e.target.checked)} />
        <img className="check-image" src={selectedWeapon?.images?.weaponType} alt="gun"></img>
      </label>
      <label className="checkbox-holder" title={`Narrow damage type scope to only ${damageTypeMap[selectedWeapon?.damageType]}`}>
        <input type="checkbox" checked={sameDamage} onChange={e => setSameDamage(e.target.checked)} />
        <img className="check-image" src={selectedWeapon?.images?.damageType} alt="element"></img>
      </label>
      <label className="checkbox-holder" title={`Narrow frame scope to only ${selectedWeapon?.frame}s`}>
        <input type="checkbox" checked={sameFrame} onChange={e => setSameFrame(e.target.checked)} />
        <img className="check-image" src={selectedWeapon?.images?.frame} alt="frame"></img>
      </label>
      <label className="checkbox-holder" title={`Narrow ammo scope to only ${ammoTypeMap[selectedWeapon?.ammoType]} ammo`}>
        <input type="checkbox" checked={sameAmmo} onChange={e => setSameAmmo(e.target.checked)} />
        <img className="check-image" src={ammoTypeImgMap[selectedWeapon?.ammoType]}
          alt="ammo"></img>
      </label>
      <label className="checkbox-holder" title={`Narrow gear scope to only Featured Gear`}>
        <input type="checkbox" checked={newGear} onChange={e => setNewGear(e.target.checked)} />
        <img className="check-image" src={avantGardeIcon}
          alt={"new gear"}></img>
      </label>
      <label className="checkbox-holder" title={`Treat same-name weapon re-issues as different weapons`}>
        <input type="checkbox" checked={sameName} onChange={e => setSameName(e.target.checked)} />
        <img className="check-image" src={mirrorMirrorEmoteIcon}
          alt={"revision"} style={{ borderRadius: '2px' }}></img>
      </label>
      <div className="modal-icon-holder" title={modalIconTitle} onClick={() => setModalShowing(true)}>
        <div className="modal-icon-bar"></div>
        <div className="modal-icon-bar"></div>
        <img className="check-image modal-icon" src={"vault.svg"} alt={"Check my gear for uniques"}></img>
        <div className="arrow-down"></div>
      </div>
    </div>;
  };

  const renderSelectedWeapon = () => {
    if (!selectedWeapon) { return null; }
    return <div className="selected-weapon">
      <div className="weapon-icon-holder">
        <img className="weapon-icon-inspect" alt={selectedWeapon?.name} src={selectedWeapon?.images?.icon}></img>
        <img className="weapon-watermark" alt={"season"} src={selectedWeapon?.images?.watermark}></img>
      </div>
      <input id="searchText" className="weapon-title"
        value={searchText}
        onChange={e => setSearchText(e.target.value)}
        placeholder="Weapon Name"
        onFocus={ev => {
          setSearching(true);
          ev.target.select();
        }}
        onBlur={() => setTimeout(() => setSearching(false), 150)}
      />
    </div>;
  };

  const renderHelperText = () => {
    const gunWord = leniency === 1 ? "weapon" : "weapons";
    const verb = leniency === 1 ? "has" : "have";
    const pluralLetter = leniency === 1 ? "" : "s";

    const gunText = sameType ? `[${selectedWeapon?.weaponType}${pluralLetter}]` : gunWord;
    const elementText = sameDamage ? `[${damageTypeMap[selectedWeapon?.damageType]}]` : "";
    const frameText = sameFrame ? `[${selectedWeapon?.frame}]` : "";
    const ammoText = sameAmmo ? `[${ammoTypeMap[selectedWeapon?.ammoType]} Ammo]` : "";
    const gearText = newGear ? `[New Gear]` : "";

    const gunEl = <span className={gunText === gunWord ? "" : 'gun-helper'}>{gunText}</span>;
    const elementEl = <span className="element-helper">{elementText}</span>;
    const frameEl = <span className="frame-helper">{frameText}</span>;
    const ammoEl = <span className="ammo-helper">{ammoText}</span>;
    const gearEl = <span className="gear-helper">{gearText}</span>;

    const lenInput = <input className="leniency-input" value={leniency} min={0}
      onFocus={e => e.target.select()}
      onBlur={e => updateLeniency(e.target.value, true)}
      title="How many other weapons with the same rolls to allow"
      onChange={e => updateLeniency(e.target.value)} />;

    // These perk combinations also appear on no more than {lenInput} other {elementEl} {frameEl} {ammoEl} {gunEl}:
    return <div className="helper-text">
      No more than {lenInput} other {elementEl} {frameEl} {ammoEl} {gearEl} {gunEl} also {verb} the following perk combinations:
    </div>;
  };

  const renderVersion = () => {
    return <small className="app-version">
      Version {pkg.version} | <a href="https://github.com/cecilbowen/roll-report" target="_blank">Source</a>
    </small>;
  };

  if (!statusGood) {
    return <Loading />;
  }

  return (
    <div className="app">
      <div className="ss-holder">
        <img className="screenshot" src={wallpaper}
          onError={ev => {
            ev.currentTarget.onerror = null;
            ev.currentTarget.src = 'blank.png';
          }} alt="background image"></img>
      </div>
      {renderOptions()}
      <div className="framing">
        {renderSelectedWeapon()}
        {renderHelperText()}
        {renderAllPerks()}
      </div>
      {renderSearchPanel()}
      <DimModal
        okText="Fetch" cancelText="Close" onCancel={() => setModalShowing(false)}
        input dim={dim} querying={fetchingDim}
        bungoLogin={bungoLogin}
        windowWidth={width}
        membershipId={membershipId}
        noBungie={oauthDisabled}
        onClick={queueDimQuery} active={modalShowing} />
      {renderVersion()}
    </div>
  );
};
export default App;
