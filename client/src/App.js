import './App.css';
import pkg from "../package.json";
import { useEffect, useState } from "react";
import {
  fetchPerkCombos, getWeaponsList, getInventoryUniques,
  getStatus, loginWithBungie, HTTPS_BASE, getMyInventoryUniques,
  getLoginStatus
} from "./d2/perkComboClient";
import DimModal from './components/DimModal';
import useWindowSize from './hooks/useWindowSize';
import Loading from './components/Loading';
import {
  ammoTypeMap, damageTypeMap, DEBUG,
  getSearchParam, setSearchParam, STATUS_RETRY,
  STATUS_RETRY_LIMIT, weaponPerDay
} from './utils';
import Options from './components/Options';
import SearchResultsPanel from './components/SearchResultsPanel';

const App = () => {
  // fetch-related
  const [statusGood, setStatusGood] = useState(false);
  const [statusCounter, setStatusCounter] = useState(0);
  const [membershipId, setMembershipId] = useState(); // if set, logged in
  const [oauthDisabled, setOauthDisabled] = useState(false);
  const [fetchingDim, setFetchingDim] = useState(false);
  const [dim, setDim] = useState();

  // search-related
  const [weaponHash, setWeaponHash] = useState();
  const [searching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [hoverIndex, setHoverIndex] = useState(-1);
  const [highlightedHash, setHighlightedHash] = useState();

  const [selectedWeapon, setSelectedWeapon] = useState();
  const [leniency, setLeniency] = useState(0);
  const [filters, setFilters] = useState({
    sameType: false,
    sameDamage: false,
    sameFrame: false,
    sameAmmo: false,
    newGear: false,
    sameName: false,
  });

  const [weapons, setWeapons] = useState([]);
  const [perkResults, setPerkResults] = useState();
  const [originResults, setOriginResults] = useState();
  const [modalShowing, setModalShowing] = useState(false);
  const [wallpaper, setWallpaper] = useState("blank.png");
  const [perkTab, setPerkTab] = useState("basic"); // basic, origin
  const [popup, setPopup] = useState();
  const { width, height } = useWindowSize();

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

  const updateHighlightedHash = hash => setHighlightedHash(hash);

  useEffect(() => {
    pollStatus();
  }, []);

  useEffect(() => {
    setFetchingDim(false);

    if (DEBUG) {
      console.log("dim", dim);
    }
  }, [dim]);

  useEffect(() => {
    setHoverIndex(-1);
  }, [searchText]);

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

          if (DEBUG) {
            console.log("weapons", rsp);
          }
        });
      }
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
    if (weaponHash) {
      checkPerks();
    }
  }, [
    weaponHash, filters, leniency
  ]);

  useEffect(() => {
    if (!searching && selectedWeapon) {
      setSearchText(selectedWeapon?.name);
    }
  }, [searching]);

  useEffect(() => {
    let imgUrl = "blank.png";
    if (selectedWeapon) {
      if (DEBUG) {
        console.log("selectedWeapon", selectedWeapon);
      }
      setSearchText(selectedWeapon?.name);
      setPerkTab("basic");
      imgUrl = selectedWeapon?.images?.screenshot;
      setSearchParam("id", selectedWeapon?.itemHash);
      setHoverIndex(-1);
    }

    setWallpaper(imgUrl);
  }, [selectedWeapon]);

  const clearDim = reason => {
    setDim({ fail: true, reason });
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
        if (event.origin !== HTTPS_BASE) { return; }

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
      sameWeaponType: filters.sameType,
      sameDamageType: filters.sameDamage,
      sameFrame: filters.sameFrame,
      sameName: filters.sameName,
      newGear: filters.newGear,
      leniency: Math.max(0, Number(leniency)),
    });

    if (DEBUG) {
      console.log("PERK COMBO RESULTS:", data);
    }
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
      clearDim(err?.message?.includes("No Destiny memberships found") ? "invalid user" : undefined);
    });
  };

  const updateFilters = (filterName, value) => {
    const newFilters = { ...filters };
    newFilters[filterName] = value;
    setFilters(newFilters);
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
        {basicNum > 0 && <div className="perk-section" onClick={() => setPerkTab("basic")}>
          <div title="[column 3, column 4] combos"
            className={`perk-section-text ${perkTab === 'basic' || 'perk-tab-inactive'}`}>
            {perkText}{` (${basicNum})`}
          </div>
        </div>}
        {originNum > 0 && <div className="perk-section" onClick={() => setPerkTab("origin")}>
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
        onKeyUp={ev => {
          switch (ev.key) {
            case "ArrowDown":
              ev.preventDefault();
              setHoverIndex(hoverIndex + 1);
              break;
            case "ArrowUp":
              ev.target.setSelectionRange(ev.target.value.length, ev.target.value.length);
              if (hoverIndex > -2) {
                setHoverIndex(hoverIndex - 1);
              }
              break;
            case "Enter":
              if (highlightedHash) {
                setWeaponHash(highlightedHash);
                ev.target.blur();
              }
            default: return;
          }
        }}
        onBlur={() => setTimeout(() => setSearching(false), 150)}
      />
    </div>;
  };

  const renderHelperText = () => {
    const gunWord = leniency === 1 ? "weapon" : "weapons";
    const verb = leniency === 1 ? "has" : "have";
    const pluralLetter = leniency === 1 ? "" : "s";

    const gunText = filters.sameType ? `[${selectedWeapon?.weaponType}${pluralLetter}]` : gunWord;
    const elementText = filters.sameDamage ? `[${damageTypeMap[selectedWeapon?.damageType]}]` : "";
    const frameText = filters.sameFrame ? `[${selectedWeapon?.frame}]` : "";
    const ammoText = filters.sameAmmo ? `[${ammoTypeMap[selectedWeapon?.ammoType]} Ammo]` : "";
    const gearText = filters.newGear ? `[New Gear]` : "";

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
      Version {pkg.version} | <a href="https://github.com/cecilbowen/roll-report" target="_blank" rel="noreferrer">Source</a>
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
          }} alt="background"></img>
      </div>
      <Options selectedWeapon={selectedWeapon} filters={filters}
        updateFilters={updateFilters} setModalShowing={setModalShowing} />
      <div className="framing">
        {renderSelectedWeapon()}
        {renderHelperText()}
        {renderAllPerks()}
      </div>
      {<SearchResultsPanel searching={searching} weapons={weapons} updateHighlightedHash={updateHighlightedHash}
        searchText={searchText} setWeaponHash={setWeaponHash} hoverIndex={hoverIndex}
        setHoverIndex={setHoverIndex} />}
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
