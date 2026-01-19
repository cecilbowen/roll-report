import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { getWrappedIndex } from '../utils';

const PANEL_LIMIT = 10; // how many weapons to list in the search results panel

const SearchResultsPanel = ({
    searching,
    weapons,
    setWeaponHash,
    searchText,
    hoverIndex,
    setHoverIndex,
    updateHighlightedHash,
}) => {
    const [searchPage, setSearchPage] = useState([]); // weapons that show up in search panel results
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    useEffect(() => {
        if (searchText) {
            const page = weapons.filter(x => x.name.toLowerCase().includes(searchText.toLowerCase()));
            page.sort((a, b) => {
                const nameComparison = a.name.localeCompare(b.name);
                if (nameComparison !== 0) {
                    return nameComparison;
                }

                return a.season - b.season;
            });
            setSearchPage(page.slice(0, PANEL_LIMIT - 1));
        } else {
            setSearchPage([]);
        }
    }, [searchText]);

    useEffect(() => {
        if (!searching) { return; }

        if (hoverIndex <= -2) {
            setHoverIndex(searchPage.length - 1);
        } else if (hoverIndex === -1) {
            setHighlightedIndex(-1);
        } else if (hoverIndex > searchPage.length - 1) {
            setHoverIndex(-1);
        } else if (hoverIndex >= 0) {
            const wrappedIndex = getWrappedIndex([-1, ...searchPage], hoverIndex); // kinda pointless to wrap now, but...
            setHighlightedIndex(wrappedIndex);
            updateHighlightedHash(searchPage[wrappedIndex]?.itemHash);
        }
    }, [hoverIndex]);

    if (!searching || searchPage.length === 0) { return null; }

    const searchBox = document.getElementById("searchText");
    const rect = searchBox.getBoundingClientRect();

    return <div className="search-panel"
        style={{
            top: `calc(${rect.top}px + ${rect.height}px + 4px)`,
            left: `calc(${rect.left}px - 4px)`,
            width: `calc(${rect.width}px + 6px)`
        }}>
        {searchPage.map((weapon, index) => {
            return <div key={weapon.itemHash}
                className={`weapon-label ${highlightedIndex === index ? "weapon-label-highlight" : ""}`}
                onClick={() => setWeaponHash(weapon.itemHash)}>
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
SearchResultsPanel.propTypes = {
    searching: PropTypes.bool,
    weapons: PropTypes.array,
    setWeaponHash: PropTypes.func,
    searchText: PropTypes.string,
    hoverIndex: PropTypes.number,
    setHoverIndex: PropTypes.func,
    updateHighlightedHash: PropTypes.func
};
export default SearchResultsPanel;
