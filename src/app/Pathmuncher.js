/* eslint-disable no-await-in-loop */
/* eslint-disable no-continue */
import CONSTANTS from "../constants.js";
import { EQUIPMENT_RENAME_MAP, RESTRICTED_EQUIPMENT } from "../data/equipment.js";
import { FEAT_RENAME_MAP, IGNORED_FEATS } from "../data/features.js";
import { PredicatePF2e } from "../lib/PredicatePF2e.js";
import logger from "../logger.js";
import utils from "../utils.js";

export class Pathmuncher {

  // eslint-disable-next-line class-methods-use-this
  get EQUIPMENT_RENAME_MAP() {
    return EQUIPMENT_RENAME_MAP;
  }

  FEAT_RENAME_MAP(name) {
    const dynamicItems = [
      { pbName: "Shining Oath", foundryName: `Shining Oath (${this.getChampionType()})` },
    ];
    return FEAT_RENAME_MAP(name).concat(dynamicItems);
  }

  // eslint-disable-next-line class-methods-use-this
  get RESTRICTED_EQUIPMENT() {
    return RESTRICTED_EQUIPMENT;
  }

  // specials that are handled by Foundry and shouldn't be added
  // eslint-disable-next-line class-methods-use-this
  get IGNORED_FEATURES () {
    return IGNORED_FEATS;
  };

  getChampionType() {
    if (this.source.alignment == "LG") return "Paladin";
    else if (this.source.alignment == "CG") return "Liberator";
    else if (this.source.alignment == "NG") return "Redeemer";
    else if (this.source.alignment == "LE") return "Tyrant";
    else if (this.source.alignment == "CE") return "Antipaladin";
    else if (this.source.alignment == "NE") return "Desecrator";
    return "Unknown";
  }

  constructor(actor, { addFeats = true, addEquipment = true, addSpells = true, addMoney = true, addLores = true,
    addWeapons = true, addArmor = true, addTreasure = true, addDeity = true, addName = true, addClass = true,
    askForChoices = false } = {}
  ) {
    this.actor = actor;
    // note not all these options do anything yet!
    this.options = {
      addTreasure,
      addMoney,
      addFeats,
      addSpells,
      addEquipment,
      addLores,
      addWeapons,
      addArmor,
      addDeity,
      addName,
      addClass,
      askForChoices,
    };
    this.source = null;
    this.parsed = {
      specials: [],
      feats: [],
      equipment: [],
    };
    this.usedLocations = new Set();
    this.autoAddedFeatureIds = new Set();
    this.autoAddedFeatureItems = {};
    this.autoAddedFeatureRules = {};
    this.grantItemLookUp = {};
    this.result = {
      character: {
        _id: this.actor.id,
        prototypeToken: {},
      },
      class: [],
      deity: [],
      heritage: [],
      ancestory: [],
      background: [],
      casters: [],
      spells: [],
      feats: [],
      weapons: [],
      armor: [],
      equipment: [],
      lores: [],
      money: [],
      treasure: [],
      adventurersPack: {
        item: null,
        contents: [
          { slug: "bedroll", qty: 1 },
          { slug: "chalk", qty: 10 },
          { slug: "flint-and-steel", qty: 1 },
          { slug: "rope", qty: 1 },
          { slug: "rations", qty: 14 },
          { slug: "torch", qty: 5 },
          { slug: "waterskin", qty: 1 },
        ],
      },
      focusPool: 0,
    };
    this.check = [];
    this.bad = [];
  }

  async fetchPathbuilder(pathbuilderId) {
    if (!pathbuilderId) {
      const flags = utils.getFlags(this.actor);
      pathbuilderId = flags?.pathbuilderId;
    }
    if (pathbuilderId) {
      const jsonData = await foundry.utils.fetchJsonWithTimeout(`https://www.pathbuilder2e.com/json.php?id=${pathbuilderId}`);
      if (jsonData.success) {
        this.source = jsonData.build;
      } else {
        ui.notifications.warn(game.i18n.format(`${CONSTANTS.FLAG_NAME}.Dialogs.Pathmuncher.FetchFailed`, { pathbuilderId }));
      }
    } else {
      ui.notifications.error(game.i18n.localize(`${CONSTANTS.FLAG_NAME}.Dialogs.Pathmuncher.NoId`));
    }
  }

  getClassAdjustedSpecialNameLowerCase(name) {
    return `${name} (${this.source.class})`.toLowerCase();
  }

  getAncestryAdjustedSpecialNameLowerCase(name) {
    return `${name} (${this.source.ancestry})`.toLowerCase();
  }

  getHeritageAdjustedSpecialNameLowerCase(name) {
    return `${name} (${this.source.heritage})`.toLowerCase();
  }

  static getMaterialGrade(material) {
    if (material.toLowerCase().includes("high-grade")) {
      return "high";
    } else if (material.toLowerCase().includes("standard-grade")) {
      return "standard";
    }
    return "low";
  }

  static getFoundryFeatLocation(pathbuilderFeatType, pathbuilderFeatLevel) {
    if (pathbuilderFeatType === "Ancestry Feat") {
      return `ancestry-${pathbuilderFeatLevel}`;
    } else if (pathbuilderFeatType === "Class Feat") {
      return `class-${pathbuilderFeatLevel}`;
    } else if (pathbuilderFeatType === "Skill Feat") {
      return `skill-${pathbuilderFeatLevel}`;
    } else if (pathbuilderFeatType === "General Feat") {
      return `general-${pathbuilderFeatLevel}`;
    } else if (pathbuilderFeatType === "Background Feat") {
      return `skill-${pathbuilderFeatLevel}`;
    } else {
      return null;
    }
  }

  #processSpecialData(name) {
    if (name.includes("Domain: ")) {
      const domainName = name.split(" ")[1];
      this.parsed.feats.push({ 0: "Deity's Domain", 1: domainName });
      return true;
    } else {
      return false;
    }
  }

  #nameMap() {
    logger.debug("Starting Equipment Rename");
    this.source.equipment
      .filter((e) => e[0] && e[0] !== "undefined")
      .forEach((e) => {
        const name = this.EQUIPMENT_RENAME_MAP.find((item) => item.pbName == e[0])?.foundryName ?? e[0];
        const item = { pbName: name, qty: e[1], added: false };
        this.parsed.equipment.push(item);
      });
    logger.debug("Finished Equipment Rename");

    logger.debug("Starting Special Rename");
    this.source.specials
      .filter((special) => special !== "undefined" && special !== this.source.heritage)
      .forEach((special) => {
        const name = this.FEAT_RENAME_MAP(special).find((map) => map.pbName == special)?.foundryName ?? special;
        if (!this.#processSpecialData(name) && !this.IGNORED_FEATURES.includes(name)) {
          this.parsed.specials.push({ name, added: false });
        }
      });
    logger.debug("Finished Special Rename");

    logger.debug("Starting Feat Rename");
    this.source.feats
      .filter((feat) => feat[0] && feat[0] !== "undefined" && feat[0] !== this.source.heritage)
      .forEach((feat) => {
        const name = this.FEAT_RENAME_MAP(feat[0]).find((map) => map.pbName == feat[0])?.foundryName ?? feat[0];
        const data = {
          name,
          extra: feat[1],
          added: false,
          type: feat[2],
          level: feat[3],
        };
        this.parsed.feats.push(data);
      });
    logger.debug("Finished Feat Rename");
  }

  #prepare() {
    this.#nameMap();
  }

  static getSizeValue(size) {
    switch (size) {
      case 0:
        return "tiny";
      case 1:
        return "sm";
      case 3:
        return "lg";
      default:
        return "med";
    }
  }

  async #processSenses() {
    const senses = [];
    this.source.specials.forEach((special) => {
      if (special === "Low-Light Vision") {
        senses.push({ type: "lowLightVision" });
      } else if (special === "Darkvision") {
        senses.push({ type: "darkvision" });
      } else if (special === "Scent") {
        senses.push({ type: "scent" });
      }
    });
    setProperty(this.result.character, "system.traits.senses", senses);
  }

  // eslint-disable-next-line class-methods-use-this
  async #processGenericCompendiumLookup(compendiumLabel, name, target) {
    const compendium = await game.packs.get(compendiumLabel);
    const index = await compendium.getIndex({ fields: ["name", "type", "system.slug"] });

    const indexMatch = index.find((i) => i.system.slug === game.pf2e.system.sluggify(name));

    if (indexMatch) {
      const doc = await compendium.getDocument(indexMatch._id);
      const itemData = doc.toObject();
      itemData._id = foundry.utils.randomID();
      this.#generateGrantItemData(itemData);
      this.result[target].push(itemData);
      return true;
    } else {
      return false;
    }
  }

  // for grants, e.g. ont he champion "Deity and Cause" where there are choices.
  // how do we determine and match these? should we?
  // "pf2e": {
  //   "itemGrants": {
  //     "adanye": {
  //       "id": "4GHcp3iaREfj2ZgN",
  //       "onDelete": "detach"
  //     },
  //     "paladin": {
  //       "id": "HGWkTEatliHgDaEu",
  //       "onDelete": "detach"
  //     }
  //   }
  // }

  // "Paladin" (granted by deity and casue)
  // "pf2e": {
  //   "grantedBy": {
  //     "id": "xnrkrJa2YE1UOAVy",
  //     "onDelete": "cascade"
  //   },
  //   "itemGrants": {
  //     "retributiveStrike": {
  //       "id": "WVHbj9LljCTovdsv",
  //       "onDelete": "detach"
  //     }
  //   }
  // }

  // retributive strike
  //   "pf2e": {
  //     "grantedBy": {
  //       "id": "HGWkTEatliHgDaEu",
  //       "onDelete": "cascade"
  //     }

  #parsedFeatureMatch(type, slug) {
    const featMatch = this.parsed[type].find((f) =>
      slug === game.pf2e.system.sluggify(f.name)
      || slug === game.pf2e.system.sluggify(this.getClassAdjustedSpecialNameLowerCase(f.name))
      || slug === game.pf2e.system.sluggify(this.getAncestryAdjustedSpecialNameLowerCase(f.name))
      || slug === game.pf2e.system.sluggify(this.getHeritageAdjustedSpecialNameLowerCase(f.name))
    );
    return featMatch;
  }

  #generatedResultMatch(type, slug) {
    const featMatch = this.result[type].find((f) => slug === f.system.slug);
    return featMatch;
  }

  #findAllFeatureMatch(slug) {
    const featMatch = this.#parsedFeatureMatch("feats", slug);
    if (featMatch) return featMatch;
    const specialMatch = this.#parsedFeatureMatch("specials", slug);
    if (specialMatch) return specialMatch;
    const deityMatch = this.#generatedResultMatch("deity", slug);
    return deityMatch;
    // const classMatch = this.#generatedResultMatch("class", slug);
    // return classMatch;
    // const equipmentMatch = this.#generatedResultMatch("equipment", slug);
    // return equipmentMatch;
  }

  #createGrantedItem(document, parent) {
    logger.debug(`Adding granted item flags to ${document.name} (parent ${parent.name})`);
    const camelCase = game.pf2e.system.sluggify(document.system.slug, { camel: "dromedary" });
    setProperty(parent, `flags.pf2e.itemGrants.${camelCase}`, { id: document._id, onDelete: "detach" });
    setProperty(document, "flags.pf2e.grantedBy", { id: parent._id, onDelete: "cascade" });
    if (!this.options.askForChoices) {
      this.result.feats.push(document);
    }

    const featureMatch = this.#findAllFeatureMatch(document.system.slug);
    if (featureMatch) {
      if (!featureMatch._id) featureMatch.added = true;
      return;
    }
    logger.warn(`Unable to find parsed feature match for granted feature ${document.name}. This might not be an issue, but might indicate feature duplication.`, { document, parent });
  }

  async #evaluateChoices(choices) {
    const choiceDocs = [];
    if (Array.isArray(choices)) {
      for (const choice of choices) {
        const doc = await fromUuid(choice.value);
        if (!doc) continue;
        choiceDocs.push(doc);
        const featMatch = this.#findAllFeatureMatch(doc.system.slug);
        if (featMatch) {
          logger.debug("Choices evaluated", { choices, choiceDocs });
          return choice.value;
        }
      }
    } else if (typeof choices === 'object' && choices !== null && choices.pack) {
      const compendium = await game.packs.get(choices.pack);
      let index = await compendium.getIndex({ fields: ["name", "type", "system.slug"] });
      if (choices.itemType) index = index.filter((i) => i.type === choices.itemType);
      for (const i of index) {
        const featMatch = this.#findAllFeatureMatch(i.system.slug);
        if (featMatch) {
          logger.debug("Choice index success", { index, choices });
          return `Compendium.${choices.pack}.${i._id}`;
        }
      }
      logger.debug("Choice index failed, evaluated", { index, choices });
    }

    logger.debug("Evaluate Choices failed", { choiceDocs, choices });
    return undefined;
  }

  async #resolveInjectedUuid(source, propertyData) {
    if (source === null || typeof source === "number" || (typeof source === "string" && !source.includes("{"))) {
      return source;
    }

    // Walk the object tree and resolve any string values found
    if (Array.isArray(source)) {
      for (let i = 0; i < source.length; i++) {
        source[i] = this.#resolveInjectedUuid(source[i]);
      }
    } else if (typeof source === 'object' && source !== null) {
      for (const [key, value] of Object.entries(source)) {
        if (typeof value === "string" || (typeof value === 'object' && value !== null)) {
          source[key] = this.#resolveInjectedUuid(value);
        }
      }
      return source;
    } else if (typeof source === "string") {
      const match = source.match(/{(actor|item|rule)\|(.*?)}/);
      if (match && match[1] === "actor") {
        return String(getProperty(this.result.character, match[1]));
      } else if (match) {
        const value = this.grantItemLookUp[match[0]].uuid;
        if (!value) {
          logger.error("Failed to resolve injected property", {
            source,
            propertyData,
            key: match[1],
            prop: match[2],
          });
        }
        return String(value);
      } else {
        logger.error("Failed to resolve injected property", {
          source,
          propertyData,
        });
      }
    }

    return source;
  }

  async #generateGrantItemData(document) {
    for (const rule of document.system.rules.filter((r) => r.key === "GrantItem" && r.uuid.includes("{"))) {
      logger.debug("Generating rules for...", { document, rule });
      const match = rule.uuid.match(/{(item|rule)\|(.*?)}/);
      if (match) {
        const flagName = match[2].split(".").pop();
        const ruleData = document.system.rules.find((rule) => rule.key === "ChoiceSet" && rule.flag === flagName)
          ?? document.system.rules.find((rule) => rule.key === "ChoiceSet");
        const value = ruleData ? await this.#evaluateChoices(ruleData.choices) : undefined;
        if (!value) {
          logger.error("Failed to resolve injected uuid", {
            ruleData,
            flagName,
            key: match[1],
            prop: match[2],
            value,
          });
        }
        this.grantItemLookUp[rule.uuid] = {
          docId: document.id,
          key: rule.uuid,
          uuid: value,
          flag: flagName,
          choiceSet: ruleData,
        };
        this.grantItemLookUp[`${document._id}-${flagName}`] = {
          docId: document.id,
          key: rule.uuid,
          uuid: value,
          flag: flagName,
          choiceSet: ruleData,
        };
        this.grantItemLookUp[`${document._id}`] = {
          docId: document.id,
          key: rule.uuid,
          uuid: value,
          flag: flagName,
          choiceSet: ruleData,
        };
      } else {
        logger.error("Failed to resolve injected uuid", {
          document,
          rule,
        });
      }
    }
  }

  async #checkRule(document, rule) {
    const tempActor = await this.#generateTempActor([document]);
    // const doc = new Item(document);
    // const choiceSetRules = new game.pf2e.RuleElements.all.ChoiceSet(choiceSet, doc)

    const predicateChecker = new PredicatePF2e(rule.predicate);
    const optionSet = await tempActor.getRollOptions();
    // console.warn("test", {
    //   predicateChecker,
    //   optionSet,
    //   rule,
    // })
    await Actor.deleteDocuments([tempActor._id]);
    return predicateChecker.test(optionSet);
  }

  async #addGrantedRules(document) {
    logger.debug("addGrantedRules", duplicate(document));
    if (document.system.rules.length === 0) return;

    if (hasProperty(document, "system.level.value")
     && document.system.level.value > this.result.character.system.details.level.value
    ) {
      return;
    }

    this.autoAddedFeatureRules[document._id] = deepClone(document.system.rules);
    const failedFeatureRules = [];

    await this.#generateGrantItemData(document);
    for (const [i, grantedRuleFeature] of document.system.rules.entries()) {
      logger.debug(`Checking ${document.name} rule: ${i} - key: ${grantedRuleFeature.key}`);
      if (grantedRuleFeature.key !== "GrantItem") {
        if (grantedRuleFeature.key === "ChoiceSet"
          && (this.grantItemLookUp[`${document._id}-${grantedRuleFeature.flag}`]
          || (!grantedRuleFeature.flag && this.grantItemLookUp[`${document._id}`]))
        ) continue;
        failedFeatureRules.push(grantedRuleFeature);
        continue;
      }
      const uuid = await this.#resolveInjectedUuid(grantedRuleFeature.uuid, grantedRuleFeature);
      const ruleFeature = await fromUuid(uuid);
      if (ruleFeature) {
        const featureDoc = ruleFeature.toObject();
        if (grantedRuleFeature.predicate) {
          const testResult = await this.#checkRule(featureDoc, grantedRuleFeature);
          if (!testResult) {
            const data = { document, grantedRuleFeature, featureDoc, testResult };
            logger.debug(`The test failed for ${document.name} rule: ${i} - key: ${grantedRuleFeature.key}`, data);
            continue;
          }
        }
        this.autoAddedFeatureIds.add(ruleFeature.id);

        featureDoc._id = foundry.utils.randomID();
        this.#createGrantedItem(featureDoc, document);
        if (hasProperty(ruleFeature, "system.rules.length")) await this.#addGrantedRules(featureDoc);
      } else {
        const data = {
          uuid: grantedRuleFeature.uuid,
          document,
          grantedRuleFeature,
          grandedFeatureLookup: this.grantItemLookUp[grantedRuleFeature.uuid],
        };
        failedFeatureRules.push(grantedRuleFeature);
        if (this.grantItemLookUp[grantedRuleFeature.uuid]) {
          failedFeatureRules.push(this.grantItemLookUp[grantedRuleFeature.uuid].choiceSet);
        }
        logger.warn("Unable to determine granted rule feature, needs better parser", data);
      }
    }
    if (!this.options.askForChoices) {
      // eslint-disable-next-line require-atomic-updates
      document.system.rules = failedFeatureRules;
    }
  }

  async #addGrantedItems(document) {
    logger.debug("addGrantedItems", duplicate(document));
    if (document.system.items) {
      this.autoAddedFeatureItems[document._id] = deepClone(document.system.items);
      const failedFeatureItems = {};
      for (const [key, grantedItemFeature] of Object.entries(document.system.items)) {
        logger.debug(`checking ${document.name} ${key}`, grantedItemFeature);
        if (grantedItemFeature.level > getProperty(this.result.character, "system.details.level.value")) continue;
        const feature = await fromUuid(grantedItemFeature.uuid);
        if (!feature) {
          const data = { uuid: grantedItemFeature.uuid, grantedFeature: grantedItemFeature, feature };
          logger.warn("Unable to determine granted item feature, needs better parser", data);
          failedFeatureItems[key] = grantedItemFeature;
          continue;
        }
        this.autoAddedFeatureIds.add(feature.id);
        const featureDoc = feature.toObject();
        featureDoc._id = foundry.utils.randomID();
        setProperty(document.system, "location", document._id);
        this.#createGrantedItem(featureDoc, document);
        if (hasProperty(featureDoc, "system.rules")) await this.#addGrantedRules(featureDoc);
      }
      if (!this.options.askForChoices) {
        // eslint-disable-next-line require-atomic-updates
        document.system.items = failedFeatureItems;
      }
    }
    if (hasProperty(document.system.rules)) await this.#addGrantedRules(document);

  }

  async #detectGrantedFeatures() {
    if (this.result.class.length > 0) await this.#addGrantedItems(this.result.class[0]);
    if (this.result.ancestory.length > 0) await this.#addGrantedItems(this.result.ancestory[0]);
    if (this.result.heritage.length > 0) await this.#addGrantedItems(this.result.heritage[0]);
    if (this.result.background.length > 0) await this.#addGrantedItems(this.result.background[0]);
  }

  async #processCore() {
    if (this.options.addName) {
      setProperty(this.result.character, "name", this.source.name);
      setProperty(this.result.character, "prototypeToken.name", this.source.name);
    }
    setProperty(this.result.character, "system.details.level.value", this.source.level);
    if (this.source.age !== "Not set") setProperty(this.result.character, "system.details.age.value", this.source.age);
    if (this.source.gender !== "Not set") setProperty(this.result.character, "system.details.gender.value", this.source.gender);
    setProperty(this.result.character, "system.details.alignment.value", this.source.alignment);
    setProperty(this.result.character, "system.details.keyability.value", this.source.keyability);
    if (this.source.deity !== "Not set") setProperty(this.result.character, "system.details.deity.value", this.source.deity);
    setProperty(this.result.character, "system.traits.size.value", Pathmuncher.getSizeValue(this.source.size));
    setProperty(this.result.character, "system.traits.languages.value", this.source.languages.map((l) => l.toLowerCase()));

    this.#processSenses();

    setProperty(this.result.character, "system.abilities.str.value", this.source.abilities.str);
    setProperty(this.result.character, "system.abilities.dex.value", this.source.abilities.dex);
    setProperty(this.result.character, "system.abilities.con.value", this.source.abilities.con);
    setProperty(this.result.character, "system.abilities.int.value", this.source.abilities.int);
    setProperty(this.result.character, "system.abilities.wis.value", this.source.abilities.wis);
    setProperty(this.result.character, "system.abilities.cha.value", this.source.abilities.cha);

    setProperty(this.result.character, "system.saves.fortitude.tank", this.source.proficiencies.fortitude / 2);
    setProperty(this.result.character, "system.saves.reflex.value", this.source.proficiencies.reflex / 2);
    setProperty(this.result.character, "system.saves.will.value", this.source.proficiencies.will / 2);

    setProperty(this.result.character, "system.martial.advanced.rank", this.source.proficiencies.advanced / 2);
    setProperty(this.result.character, "system.martial.heavy.rank", this.source.proficiencies.heavy / 2);
    setProperty(this.result.character, "system.martial.light.rank", this.source.proficiencies.light / 2);
    setProperty(this.result.character, "system.martial.medium.rank", this.source.proficiencies.medium / 2);
    setProperty(this.result.character, "system.martial.unarmored.rank", this.source.proficiencies.unarmored / 2);
    setProperty(this.result.character, "system.martial.martial.rank", this.source.proficiencies.martial / 2);
    setProperty(this.result.character, "system.martial.simple.rank", this.source.proficiencies.simple / 2);
    setProperty(this.result.character, "system.martial.unarmed.rank", this.source.proficiencies.unarmed / 2);

    setProperty(this.result.character, "system.skills.acr.rank", this.source.proficiencies.acrobatics / 2);
    setProperty(this.result.character, "system.skills.arc.rank", this.source.proficiencies.arcana / 2);
    setProperty(this.result.character, "system.skills.ath.rank", this.source.proficiencies.athletics / 2);
    setProperty(this.result.character, "system.skills.cra.rank", this.source.proficiencies.crafting / 2);
    setProperty(this.result.character, "system.skills.dec.rank", this.source.proficiencies.deception / 2);
    setProperty(this.result.character, "system.skills.dip.rank", this.source.proficiencies.diplomacy / 2);
    setProperty(this.result.character, "system.skills.itm.rank", this.source.proficiencies.intimidation / 2);
    setProperty(this.result.character, "system.skills.med.rank", this.source.proficiencies.medicine / 2);
    setProperty(this.result.character, "system.skills.nat.rank", this.source.proficiencies.nature / 2);
    setProperty(this.result.character, "system.skills.occ.rank", this.source.proficiencies.occultism / 2);
    setProperty(this.result.character, "system.skills.prf.rank", this.source.proficiencies.performance / 2);
    setProperty(this.result.character, "system.skills.rel.rank", this.source.proficiencies.religion / 2);
    setProperty(this.result.character, "system.skills.soc.rank", this.source.proficiencies.society / 2);
    setProperty(this.result.character, "system.skills.ste.rank", this.source.proficiencies.stealth / 2);
    setProperty(this.result.character, "system.skills.sur.rank", this.source.proficiencies.survival / 2);
    setProperty(this.result.character, "system.skills.thi.rank", this.source.proficiencies.thievery / 2);

    setProperty(this.result.character, "system.attributes.perception.rank", this.source.proficiencies.perception / 2);
    setProperty(this.result.character, "system.attributes.classDC.rank", this.source.proficiencies.classDC / 2);
  }

  async #generateFeatItems(compendiumLabel) {
    const compendium = await game.packs.get(compendiumLabel);
    const index = await compendium.getIndex({ fields: ["name", "type", "system.slug"] });

    for (const featArray of [this.parsed.feats, this.parsed.specials]) {
      for (const pBFeat of featArray) {
        if (pBFeat.added) continue;
        logger.debug("Generating feature for", pBFeat);

        const indexMatch = index.find((i) =>
          i.system.slug === game.pf2e.system.sluggify(pBFeat.name)
          || i.system.slug === game.pf2e.system.sluggify(this.getClassAdjustedSpecialNameLowerCase(pBFeat.name))
          || i.system.slug === game.pf2e.system.sluggify(this.getAncestryAdjustedSpecialNameLowerCase(pBFeat.name))
          || i.system.slug === game.pf2e.system.sluggify(this.getHeritageAdjustedSpecialNameLowerCase(pBFeat.name))
        );
        const displayName = pBFeat.extra ? `${pBFeat.name} (${pBFeat.extra})` : pBFeat.name;
        if (!indexMatch) {
          logger.debug(`Unable to match feat ${displayName}`, { displayName, name: pBFeat.name, extra: pBFeat.extra, pBFeat, compendiumLabel });
          this.check.push({ pbName: displayName, type: "feat", details: { displayName, name: pBFeat.name, extra: pBFeat.extra, pBFeat, compendiumLabel } });
          continue;
        }
        if (this.result.feats.some((i) => i.name === displayName)) {
          logger.debug("Feat already generated", { displayName, pBFeat, compendiumLabel });
          continue;
        }
        pBFeat.added = true;
        if (this.autoAddedFeatureIds.has(indexMatch._id)) {
          logger.debug("Feat included in class features auto add", { displayName, pBFeat, compendiumLabel });
          continue;
        }

        const doc = await compendium.getDocument(indexMatch._id);
        const item = doc.toObject();
        item.name = displayName;

        if (pBFeat.type && pBFeat.level) {
          const location = Pathmuncher.getFoundryFeatLocation(pBFeat.type, pBFeat.level);
          if (!this.usedLocations.has(location)) {
            item.system.location = location;
            this.usedLocations.add(location);
          }
        }

        this.result.feats.push(item);
      }
    }
  }

  async #generateSpecialItems(compendiumLabel) {
    const compendium = await game.packs.get(compendiumLabel);
    const index = await compendium.getIndex({ fields: ["name", "type", "system.slug"] });

    for (const special of this.parsed.specials) {
      if (special.added) continue;
      logger.debug("Generating special for", special);
      const indexMatch = index.find((i) =>
        i.system.slug === game.pf2e.system.sluggify(special.name)
        || i.system.slug === game.pf2e.system.sluggify(this.getClassAdjustedSpecialNameLowerCase(special.name))
        || i.system.slug === game.pf2e.system.sluggify(this.getAncestryAdjustedSpecialNameLowerCase(special.name))
        || i.system.slug === game.pf2e.system.sluggify(this.getHeritageAdjustedSpecialNameLowerCase(special.name))
      );
      if (!indexMatch) {
        logger.debug(`Unable to match special ${special.name}`, { special: special.name, compendiumLabel });
        this.check.push({ pbName: special.name, type: "special", details: { special: special.name, compendiumLabel } });
        continue;
      }
      if (this.result.feats.some((i) => i.name === special.name)) {
        logger.debug("Special already generated", { special: special.name, compendiumLabel });
        continue;
      }
      special.added = true;
      if (this.autoAddedFeatureIds.has(indexMatch._id)) {
        logger.debug("Special included in class features auto add", { special: special.name, compendiumLabel });
        continue;
      }

      const doc = await compendium.getDocument(indexMatch._id);
      this.result.feats.push(doc.toObject());
    }
  }

  async #generateEquipmentItems(pack = "pf2e.equipment-srd") {
    const compendium = game.packs.get(pack);
    const index = await compendium.getIndex({ fields: ["name", "type", "system.slug"] });
    const compendiumBackpack = await compendium.getDocument("3lgwjrFEsQVKzhh7");

    const adventurersPack = this.parsed.equipment.find((e) => e.pbName === "Adventurer's Pack");
    const backpackInstance = adventurersPack ? compendiumBackpack.toObject() : null;
    if (backpackInstance) {
      adventurersPack.added = true;
      backpackInstance._id = foundry.utils.randomID();
      this.result.adventurersPack.item = adventurersPack;
      this.result.equipment.push(backpackInstance);
      for (const content of this.result.adventurersPack.contents) {
        const indexMatch = index.find((i) => i.system.slug === content.slug);
        if (!indexMatch) {
          logger.error(`Unable to match adventurers kit item ${content.name}`, content);
          continue;
        }

        const doc = await compendium.getDocument(indexMatch._id);
        const itemData = doc.toObject();
        itemData._id = foundry.utils.randomID();
        itemData.system.quantity = content.qty;
        itemData.system.containerId = backpackInstance?._id;
        this.result.equipment.push(itemData);
      }
    }

    for (const e of this.parsed.equipment) {
      if (e.pbName === "Adventurer's Pack") continue;
      if (e.added) continue;
      logger.debug("Generating item for", e);
      const indexMatch = index.find((i) => i.system.slug === game.pf2e.system.sluggify(e.pbName));
      if (!indexMatch) {
        logger.error(`Unable to match ${e.pbName}`, e);
        this.bad.push({ pbName: e.pbName, type: "equipment", details: { e } });
        continue;
      }

      const doc = await compendium.getDocument(indexMatch._id);
      if (doc.type != "kit") {
        const itemData = doc.toObject();
        itemData._id = foundry.utils.randomID();
        itemData.system.quantity = e.qty;
        const type = doc.type === "treasure" ? "treasure" : "equipment";
        this.result[type].push(itemData);
      }
      // eslint-disable-next-line require-atomic-updates
      e.added = true;
    }
  }

  async #generateWeaponItems() {
    const compendium = game.packs.get("pf2e.equipment-srd");
    const index = await compendium.getIndex({ fields: ["name", "type", "system.slug"] });

    for (const w of this.source.weapons) {
      logger.debug("Generating weapon for", w);
      const indexMatch = index.find((i) => i.system.slug === game.pf2e.system.sluggify(w.name));
      if (!indexMatch) {
        logger.error(`Unable to match weapon item ${w.name}`, w);
        this.bad.push({ pbName: w.name, type: "weapon", details: { w } });
        continue;
      }

      const doc = await compendium.getDocument(indexMatch._id);
      const itemData = doc.toObject();
      itemData._id = foundry.utils.randomID();
      itemData.system.quantity = w.qty;
      itemData.system.damage.die = w.die;
      itemData.system.potencyRune.value = w.pot;
      itemData.system.strikingRune.value = w.str;

      if (w.runes[0]) itemData.system.propertyRune1.value = game.pf2e.system.sluggify(w.runes[0], { camel: "dromedary" });
      if (w.runes[1]) itemData.system.propertyRune2.value = game.pf2e.system.sluggify(w.runes[1], { camel: "dromedary" });
      if (w.runes[2]) itemData.system.propertyRune3.value = game.pf2e.system.sluggify(w.runes[2], { camel: "dromedary" });
      if (w.runes[3]) itemData.system.propertyRune4.value = game.pf2e.system.sluggify(w.runes[3], { camel: "dromedary" });
      if (w.mat) {
        const material = w.mat.split(" (")[0];
        itemData.system.preciousMaterial.value = game.pf2e.system.sluggify(material, { camel: "dromedary" });
        itemData.system.preciousMaterialGrade.value = Pathmuncher.getMaterialGrade(w.mat);
      }
      if (w.display) itemData.name = w.display;

      this.result.weapons.push(itemData);
      w.added = true;
    }
  }

  async #generateArmorItems() {
    const compendium = game.packs.get("pf2e.equipment-srd");
    const index = await compendium.getIndex({ fields: ["name", "type", "system.slug"] });

    for (const a of this.source.armor) {
      logger.debug("Generating armor for", a);
      const indexMatch = index.find((i) =>
        i.system.slug === game.pf2e.system.sluggify(a.name)
        || i.system.slug === game.pf2e.system.sluggify(`${a.name} Armor`)
      );
      if (!indexMatch) {
        logger.error(`Unable to match armor kit item ${a.name}`, a);
        this.bad.push({ pbName: a.name, type: "armor", details: { a } });
        continue;
      }

      const doc = await compendium.getDocument(indexMatch._id);
      const itemData = doc.toObject();
      itemData._id = foundry.utils.randomID();
      itemData.system.equipped.value = a.worn ?? false;
      if (!this.RESTRICTED_EQUIPMENT.some((i) => itemData.name.startsWith(i))) {
        itemData.system.quantity = a.qty;
        itemData.system.category = a.prof;
        itemData.system.potencyRune.value = a.pot;
        itemData.system.resiliencyRune.value = a.res;

        if (a.runes[0]) itemData.system.propertyRune1.value = game.pf2e.system.sluggify(a.runes[0], { camel: "dromedary" });
        if (a.runes[1]) itemData.system.propertyRune2.value = game.pf2e.system.sluggify(a.runes[1], { camel: "dromedary" });
        if (a.runes[2]) itemData.system.propertyRune3.value = game.pf2e.system.sluggify(a.runes[2], { camel: "dromedary" });
        if (a.runes[3]) itemData.system.propertyRune4.value = game.pf2e.system.sluggify(a.runes[3], { camel: "dromedary" });
        if (a.mat) {
          const material = a.mat.split(" (")[0];
          itemData.system.preciousMaterial.value = game.pf2e.system.sluggify(material, { camel: "dromedary" });
          itemData.system.preciousMaterialGrade.value = Pathmuncher.getMaterialGrade(a.mat);
        }
      }
      if (a.display) itemData.name = a.display;

      this.result.armor.push(itemData);
      // eslint-disable-next-line require-atomic-updates
      a.added = true;
    }
  }

  async #generateSpellCaster(caster) {
    const magicTradition = caster.magicTradition === "focus" ? "divine" : caster.magicTradition;
    const spellcastingType = caster.magicTradition === "focus" ? caster.magicTradition : caster.spellcastingType;

    const spellcastingEntity = {
      ability: {
        value: caster.ability,
      },
      proficiency: {
        value: caster.proficiency / 2,
      },
      spelldc: {
        item: 0,
      },
      tradition: {
        value: magicTradition,
      },
      prepared: {
        value: spellcastingType,
        flexible: false
      },
      slots: {
        slot0: {
          max: caster.perDay[0],
          prepared: [],
          value: caster.perDay[0],
        },
        slot1: {
          max: caster.perDay[1],
          prepared: [],
          value: caster.perDay[1],
        },
        slot2: {
          max: caster.perDay[2],
          prepared: [],
          value: caster.perDay[2],
        },
        slot3: {
          max: caster.perDay[3],
          prepared: [],
          value: caster.perDay[3],
        },
        slot4: {
          max: caster.perDay[4],
          prepared: [],
          value: caster.perDay[4],
        },
        slot5: {
          max: caster.perDay[5],
          prepared: [],
          value: caster.perDay[5],
        },
        slot6: {
          max: caster.perDay[6],
          prepared: [],
          value: caster.perDay[6],
        },
        slot7: {
          max: caster.perDay[7],
          prepared: [],
          value: caster.perDay[7],
        },
        slot8: {
          max: caster.perDay[8],
          prepared: [],
          value: caster.perDay[8],
        },
        slot9: {
          max: caster.perDay[9],
          prepared: [],
          value: caster.perDay[9],
        },
        slot10: {
          max: caster.perDay[10],
          prepared: [],
          value: caster.perDay[10],
        },
      },
      showUnpreparedSpells: { value: true },
    };
    const data = {
      _id: foundry.utils.randomID(),
      name: caster.name,
      type: "spellcastingEntry",
      system: spellcastingEntity,
    };
    this.result.casters.push(data);
    return data;
  }

  async #processSpells() {
    const compendium = game.packs.get("pf2e.spells-srd");
    const index = await compendium.getIndex({ fields: ["name", "type", "system.slug"] });

    for (const caster of this.source.spellCasters) {
      logger.debug("Generating caster for", caster);
      if (Number.isInteger(parseInt(caster.focusPoints))) this.result.focusPool += caster.focusPoints;
      caster.instance = await this.#generateSpellCaster(caster);

      for (const spellSelection of caster.spells) {
        const level = spellSelection.level;

        for (const spell of spellSelection.list) {
          logger.debug("spell details", { spell, spellSelection, list: spellSelection.list });
          const indexMatch = index.find((i) => i.system.slug === game.pf2e.system.sluggify(spell));
          if (!indexMatch) {
            logger.error(`Unable to match spell ${spell}`, { spell, spellSelection, caster });
            this.bad.push({ pbName: spell, type: "spell", details: { spell, spellSelection, caster } });
            continue;
          }

          const doc = await compendium.getDocument(indexMatch._id);
          const itemData = doc.toObject();
          itemData._id = foundry.utils.randomID();
          itemData.system.location.heightenedLevel = level;
          itemData.system.location.value = caster.instance._id;
          this.result.spells.push(itemData);
        }
      }
    }

    setProperty(this.result.character, "system.resources.focus.max", this.result.focusPool);
    setProperty(this.result.character, "system.resources.focus.value", this.result.focusPool);
  }

  async #generateLores() {
    for (const lore of this.source.lores) {
      const data = {
        name: lore[0],
        type: "lore",
        system: {
          proficient: {
            value: lore[1] / 2,
          },
          featType: "",
          mod: {
            value: 0,
          },
          item: {
            value: 0,
          },
        },
      };
      this.result.lores.push(data);
    }
  }

  async #generateMoney() {
    const compendium = game.packs.get("pf2e.equipment-srd");
    const index = await compendium.getIndex({ fields: ["name", "type", "system.slug"] });
    const moneyLookup = [
      { slug: "platinum-pieces", type: "pp" },
      { slug: "gold-pieces", type: "gp" },
      { slug: "silver-pieces", type: "sp" },
      { slug: "copper-pieces", type: "cp" },
    ];

    for (const lookup of moneyLookup) {
      const indexMatch = index.find((i) => i.system.slug === lookup.slug);
      if (indexMatch) {
        const doc = await compendium.getDocument(indexMatch._id);
        doc.system.quantity = this.source.money[lookup.type];
        const itemData = doc.toObject();
        itemData._id = foundry.utils.randomID();
        this.result.money.push(itemData);
      }
    }
  }

  async #processFeats() {
    await this.#generateFeatItems("pf2e.feats-srd");
    await this.#generateFeatItems("pf2e.ancestryfeatures");
    await this.#generateSpecialItems("pf2e.ancestryfeatures");
    await this.#generateSpecialItems("pf2e.classfeatures");
    await this.#generateSpecialItems("pf2e.actionspf2e");
  }

  async #processEquipment() {
    await this.#generateEquipmentItems();
    await this.#generateWeaponItems();
    await this.#generateArmorItems();
    await this.#generateMoney();
  }

  async #generateTempActor(documents = []) {
    const actorData = mergeObject({ type: "character" }, this.result.character);
    actorData.name = "Mr Temp";
    const actor = await Actor.create(actorData);

    const items = documents.concat(
      ...this.result.feats,
      ...this.result.class,
      ...this.result.background,
      ...this.result.ancestory,
      ...this.result.heritage,
      ...this.result.deity,
      ...this.result.lores,
    ).map((i) => {
      if (i.system.items) i.system.items = [];
      if (i.system.rules) i.system.rules = [];
      return i;
    });

    await actor.createEmbeddedDocuments("Item", items, { keepId: true });
    const ruleUpdates = [];
    for (const [key, value] of Object.entries(this.autoAddedFeatureRules)) {
      ruleUpdates.push({
        _id: key,
        system: {
          rules: value,
        },
      });
    }
    await actor.updateEmbeddedDocuments("Item", ruleUpdates);

    const itemUpdates = [];
    for (const [key, value] of Object.entries(this.autoAddedFeatureItems)) {
      itemUpdates.push({
        _id: key,
        system: {
          items: value,
        },
      });
    }
    await actor.updateEmbeddedDocuments("Item", itemUpdates);

    logger.debug("Final temp actor", actor);
    return actor;
  }

  async processCharacter() {
    if (!this.source) return;
    this.#prepare();
    await this.#processCore();
    await this.#processGenericCompendiumLookup("pf2e.deities", this.source.deity, "deity");
    await this.#processGenericCompendiumLookup("pf2e.backgrounds", this.source.background, "background");
    await this.#processGenericCompendiumLookup("pf2e.classes", this.source.class, "class");
    await this.#processGenericCompendiumLookup("pf2e.ancestries", this.source.ancestry, "ancestory");
    await this.#processGenericCompendiumLookup("pf2e.heritages", this.source.heritage, "heritage");
    await this.#detectGrantedFeatures();
    await this.#processFeats();
    await this.#processEquipment();
    await this.#processSpells();
    await this.#generateLores();
  }

  async updateActor() {
    const moneyIds = this.actor.items.filter((i) =>
      i.type === "treasure"
      && ["Platinum Pieces", "Gold Pieces", "Silver Pieces", "Copper Pieces"].includes(i.name)
    );
    const classIds = this.actor.items.filter((i) => i.type === "class");
    const backgroundIds = this.actor.items.filter((i) => i.type === "background");
    const heritageIds = this.actor.items.filter((i) => i.type === "heritage");
    const ancestryIds = this.actor.items.filter((i) => i.type === "ancestry");
    const treasureIds = this.actor.items.filter((i) => i.type === "treasure" && !moneyIds.includes(i.id));
    const featIds = this.actor.items.filter((i) => i.type === "feat");
    const actionIds = this.actor.items.filter((i) => i.type === "action");
    const equipmentIds = this.actor.items.filter((i) =>
      i.type === "equipment" || i.type === "backpack" || i.type === "consumable"
    );
    const weaponIds = this.actor.items.filter((i) => i.type === "weapon");
    const armorIds = this.actor.items.filter((i) => i.type === "armor");
    const loreIds = this.actor.items.filter((i) => i.type === "lore");
    const spellIds = this.actor.items.filter((i) => i.type === "spell" || i.type === "spellcastingEntry");

    console.warn("ids", {
      moneyIds,
      classIds,
      backgroundIds,
      heritageIds,
      ancestryIds,
      treasureIds,
      featIds,
      actionIds,
      equipmentIds,
      weaponIds,
      armorIds,
      loreIds,
      spellIds,
    });
    // TODO: Actually respect deletion choices.
    // await this.actor.deleteEmbeddedDocuments("Item", deleteIds);
    await this.actor.deleteEmbeddedDocuments("Item", [], { deleteAll: true });

    console.warn(this.result);
    await this.actor.update(this.result.character);
    await this.actor.createEmbeddedDocuments("Item", this.result.deity, { keepId: true });
    await this.actor.createEmbeddedDocuments("Item", this.result.ancestory, { keepId: true });
    await this.actor.createEmbeddedDocuments("Item", this.result.heritage, { keepId: true });
    await this.actor.createEmbeddedDocuments("Item", this.result.background, { keepId: true });
    await this.actor.createEmbeddedDocuments("Item", this.result.class, { keepId: true });
    await this.actor.createEmbeddedDocuments("Item", this.result.lores);
    // for (const feat of this.result.feats.reverse()) {
    //   console.warn(`creating ${feat.name}`, feat);
    //   await this.actor.createEmbeddedDocuments("Item", [feat], { keepId: true });
    // }
    await this.actor.createEmbeddedDocuments("Item", this.result.feats, { keepId: true });
    await this.actor.createEmbeddedDocuments("Item", this.result.casters, { keepId: true });
    await this.actor.createEmbeddedDocuments("Item", this.result.spells);
    await this.actor.createEmbeddedDocuments("Item", this.result.equipment);
    await this.actor.createEmbeddedDocuments("Item", this.result.weapons);
    await this.actor.createEmbeddedDocuments("Item", this.result.armor);
    await this.actor.createEmbeddedDocuments("Item", this.result.treasure);
    await this.actor.createEmbeddedDocuments("Item", this.result.money);

    // Loop back over items and add rule and item progression data back in.
    if (!this.options.askForChoices) {
      const ruleUpdates = [];
      for (const [key, value] of Object.entries(this.autoAddedFeatureRules)) {
        ruleUpdates.push({
          _id: key,
          system: {
            rules: value,
          },
        });
      }
      await this.actor.updateEmbeddedDocuments("Item", ruleUpdates);

      const itemUpdates = [];
      for (const [key, value] of Object.entries(this.autoAddedFeatureItems)) {
        itemUpdates.push({
          _id: key,
          system: {
            items: value,
          },
        });
      }
      await this.actor.updateEmbeddedDocuments("Item", itemUpdates);
    }
  }
}