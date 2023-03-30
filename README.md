# Pathmuncher

![Latest Release Download Count](https://img.shields.io/badge/dynamic/json?label=Downloads%20(Latest)&query=assets%5B1%5D.download_count&url=https%3A%2F%2Fapi.github.com%2Frepos%2FMrPrimate%2Fpathmuncher%2Freleases%2Flatest)
![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Fpathmuncher&colorB=4aa94a)
![Foundry Core Compatible Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2FMrPrimate%2Fpathmuncher%2Fmain%2Fmodule-template.json&label=Foundry%20Version&query=$.compatibleCoreVersion&colorB=orange)

Import characters from Pathbuilder to Foundry Pathfinder 2e.

![gif-preview](./docs/demo.gif)

## About

This is inspired by the previous [pathbuilder2e-import](https://github.com/kobseryqum/foundry-pathbuilder2e-import) package, but is written afresh from the ground up, capturing some of my experience from [DDB Importer](https://github.com/MrPrimate/ddb-importer).

To use this module the users must have the CREATE ACTOR ability, as it creates temporary actors as part of the import process.

## Known Issues

- [Pathbuilder JSON does not distinguish between prepared spells and known spells for prepared spell casters like the Witch and Wizard.](https://gitlab.com/doctor.unspeakable/pathbuilder-2e-web-version/-/issues/794)
- Pathbuilder JSON does not contain ritual spell data at the moment.
- [Pathbuilder JSON does not contain any details about containers.](https://gitlab.com/doctor.unspeakable/pathbuilder-2e-web-version/-/issues/677)
- Pathbuilder JSON does not export the tradition of focus spells. The builder takes a good guess at these, but it's worth checking to make sure.
- [Pathbuilder JSON does not contain details of ability score choices](https://gitlab.com/doctor.unspeakable/pathbuilder-2e-web-version/-/issues/793), just final scores. so custom ability score assignment is used.
- There are differences between Pathbuilder names and Foundry names. If you find any, please open an issue, or drop a note in Discord with as much detail as possible, ideally with a shared link to a pathbuilder character.
- Support for "dual classed" characters from the Advanced Players guide is ropey at best.

## Bugs and Issues

Please open bugs and issues on [github](https://github.com/MrPrimate/pathmuncher/issues/new/choose), or via the Discord channel [#pathmuncher](https://discord.gg/M6jvpfreNd).
