# Roll Report

This app helps you find one-of-a-kind Destiny 2 weapon rolls.  Search the weapon you want and the app will show you which of it's perk combinations are truly unique to that weapon.  It will show you both unique `[column3, column 4]` combos *and* unique `[column 3/4, origin trait]` combos.  For example, when looking at Unworthy, `[Firefly, Voltshot]` is a unique `[column 3, column 4]` roll, and both `[Firefly, Subjugation]` and `[Voltshot, Subjugation]` are respectively listed as unique `[column 3, origin trait]` and `[column 4, origin trait]` rolls.

### Check it out here: [roll.report](https://www.roll.report).

## Filters

If you want more specific results, there are some filters you can choose from at the top left of the app in the form of checkboxes.  Each one narrows the comparison scope when determing if a weapon has unique rolls in the following ways:

- **Weapon Type** - only compare against weapons of the same type (scout rifles, shotguns, swords, etc.)
- **Damage Type** - only compare against weapons with the same damage type (arc, solar, void, etc.)
- **Frame** - only compare against weapons with the same frame (aggressive frame, heat weapon, rapid-fire frame)
- **Ammo Type** - only compare against weapons with the same ammo type (primary, special or heavy)
- **Featured Gear** - only compare against "Featured Gear" (aka "New Gear") weapons
- **Revisions** - treat revised/re-issued weapons of the same name as different weapons.  For example, Praedyth's Revenge (3653573172) can roll `[Osmosis, High-Impact Reserves]` which no other weapon in the game can roll *besides* the newer, re-issued Praedyth's Revenge.  Without this filter turned on, `[Osmosis, High-Impact Reserves]` will show up as a unique roll.  If turned on however, it will treat the newer, re-issued Praedyth's Revenge as a separate weapon, and therefore `[Osmosis, High-Impact Reserves]` will no longer be listed as a unique roll.  Note: This is the only filter that has the potential to show *less* unique rolls when turned on (the others always can only show more).

## Leniency Scalar

You might have noticed the text above perks on the app that reads: 
> *"No more than 0 other weapons also have the following perk combinations:"*

By default, it means: 
> *"When checking each roll on a weapon, if we find at least 0 other weapons with that roll, don't list the roll as unique"*.

The `0` here is a number input field that can be changed.  This means that if you want to count a roll that only exists on **at most** two *other* weapons (three weapons total, counting the one on the page), then you could change the `0` to a `2`.

## DIM Export

There is a vault symbol near the bottom-right corner of the page that brings up a pop-up when you click it.  It can check your entire vault/inventory of weapons and give you back a DIM (Destiny Item Manager) query that you can paste into the DIM search box to have it list you all your weapons that have one-of-a-kind rolls.  This allows you to be able to do whatever you want with them there, like maybe tagging them or etc.  In order for this to work, you need to either login via Bungie.net or enter your Bungie name.  If you choose to just enter your Bungie name and not login, the app can only access what you have set to public.  By default, this means it can only see your equipped gear.  You can change this by going into your Bungie.net settings if you wish, and [look for a checkbox under](https://i.imgur.com/XS0nEnl.png) `Privacy > Show my non-equipped Inventory`.  Toggling this ON will make your vault and postmaster public.
