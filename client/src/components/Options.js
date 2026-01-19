import PropTypes from 'prop-types';
import { getFilterDesc, getFilterIcon } from '../utils';

const Options = ({
    selectedWeapon,
    filters,
    updateFilters,
    setModalShowing,
}) => {
    if (!selectedWeapon) { return null; }

    const renderIconCheckbox = filter => {
        const filterName = filter[0];
        const filterValue = filter[1];
        return <label className="checkbox-holder" title={getFilterDesc(filterName, selectedWeapon)} key={filterName}>
            <input type="checkbox" checked={filterValue} onChange={e => updateFilters(filterName, e.target.checked)} />
            <img className="check-image" src={getFilterIcon(filterName, selectedWeapon)} alt={filterName}></img>
        </label>;
    };

    return <div className="options">
        {Object.entries(filters).map(filter => renderIconCheckbox(filter))}
        <div className="modal-icon-holder" title={"Check your gear for unique rolls"} onClick={() => setModalShowing(true)}>
            <div className="modal-icon-bar"></div>
            <div className="modal-icon-bar"></div>
            <img className="check-image modal-icon" src={"vault.svg"} alt={"unique check"}></img>
            <div className="arrow-down"></div>
        </div>
    </div>;
};
Options.propTypes = {
    selectedWeapon: PropTypes.object,
    filters: PropTypes.object,
    updateFilters: PropTypes.func,
    setModalShowing: PropTypes.func,
};
export default Options;
