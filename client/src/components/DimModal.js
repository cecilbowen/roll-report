/* eslint-disable no-confusing-arrow */
import { useState } from "react";
import { copyTextToClipboard } from "../utils";
import PropTypes from 'prop-types';

const DimModal = ({
    okText = "Ok", cancelText = "Cancel",
    onClick, onCancel, input, active, dim,
    querying, bungoLogin, windowWidth,
    membershipId, noBungie
}) => {
    const [inputValue, setInputValue] = useState("");

    if (!active) { return null; }

    // dim logo: https://raw.githubusercontent.com/DestinyItemManager/DIM/refs/heads/master/icons/release/favicon-96x96.png

    const helpLink = "https://i.imgur.com/XS0nEnl.png";
    const part1 = `Login with Bungie.net or enter your Bungie Name to get text you can paste into DIM to see` +
        ` which of your weapons have unique rolls. If you do not login and your `;
    const settingStr = `non-equipped inventory setting`;
    const part2 = " is off on Bungie.net (default), the tool will only be able to access your equipped gear.";

    const bungieTagPattern = /^[A-Za-z0-9 _\-\.]{3,26}#[0-9]{4}$/;
    const isMobile = windowWidth <= 500;
    const roomy = windowWidth > 800;
    const loggedIn = membershipId !== undefined;

    const onEnter = ev => {
        if (inputValue && (ev.key === 'Enter' || ev.keyCode === 13)) {
            if (bungieTagPattern.test(inputValue) && !querying) {
                onClick(inputValue);
            }
        }
    };

    const textRender = isMobile ? <>
        Login or enter a Bungie Name for a DIM query of all owned unique rolls.
    </> : <>
        {part1}
        <a href={helpLink} target="_blank" rel="noreferrer" style={{ color: "aqua" }}>
            {settingStr}
        </a>
        {part2}
    </>;

    const tag = isMobile ? "-mobile" : "";
    const formatReason = reason => reason ? ` (${reason})` : "";

    return <div className="modal-screen" onClick={onCancel}>
        <div className="modal" onClick={ev => ev.stopPropagation()}>
            <div className={`modal-inner${tag}`} style={ roomy ? { maxWidth: '70%' } : {}}>
                <div className="modal-badge-holder">
                    <img className="modal-badge" alt="dim icon"
                        src="dim.png"></img>
                    {dim?.text && !querying && dim.amount > 0 &&
                    <button disabled={querying} className="btn-dim" onClick={() => copyTextToClipboard(dim.text)}>
                        Copy DIM Query
                    </button>}
                    {querying && <div className="dim-loader-holder">
                        <div className="dim-loader"></div>
                    </div>}
                    {querying && <span className="dim-loader-text">Loading</span>}
                </div>

                <div className="modal-content">
                    <div className="modal-header">DIM Export</div>
                    <div className="modal-text">
                        {textRender}
                        {dim?.text && !querying && dim.amount > 0 &&
                        <span className="dim-ready" onClick={() => copyTextToClipboard(dim.text)}>
                            {`${isMobile ? "Tap" : "Click"} to copy ${dim.amount} unique rolls for DIM!`}
                        </span>}
                        {dim?.text && !querying && dim.amount === 0 &&
                        <span className="dim-ready none-found">
                            {`No unique rolls found!`}
                        </span>}
                        {dim?.fail && <span className="dim-fail">{`DIM query failed${formatReason(dim?.reason)}.`}</span>}
                    </div>
                    <div className="modal-input-holder">
                        {input && <input id="modalInput" className="modal-input" value={inputValue}
                            type="text" onKeyUp={onEnter}
                            pattern={bungieTagPattern.source}
                            placeholder="BungieName#7777" onChange={ev => setInputValue(ev.target.value)}></input>}
                        <button className="btn-ok" disabled={querying}
                            onClick={() => {
                                if (document?.getElementById("modalInput").checkValidity() && !querying) {
                                    onClick(inputValue);
                                }
                            }}>{querying ? "Loading..." : okText}</button>
                    </div>
                    <div className="modal-buttons">
                        <button className="btn-bungie" onClick={() => bungoLogin()} disabled={querying || noBungie}>
                            {loggedIn ? "Get Rolls" : "Bungie Login"}
                        </button>
                        <button className="btn-close" onClick={onCancel}>{cancelText}</button>
                    </div>
                </div>
            </div>
            <div className="modal-footer">

            </div>
        </div>
    </div>;
};
DimModal.propTypes = {
    okText: PropTypes.string,
    cancelText: PropTypes.string,
    onClick: PropTypes.func,
    onCancel: PropTypes.func,
    bungoLogin: PropTypes.func,
    input: PropTypes.bool,
    active: PropTypes.bool,
    dim: PropTypes.object,
    querying: PropTypes.bool,
    windowWidth: PropTypes.bool,
    membershipId: PropTypes.string,
    noBungie: PropTypes.bool
};
export default DimModal;
