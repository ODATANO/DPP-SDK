/**
 * BatteryPass-Ready guide document profile (DIN DKE SPEC 99100 shape,
 * `Battery_Passport` root) for the generic document store, plus the
 * Longlist v1.2 access classes. Consumer seed scripts must stay in sync.
 */
import type { AccessClass } from '../access';
import type { DocumentProfile } from '../store';

const LI: AccessClass = 'legitimateInterest';

/** Guide attribute name -> longlist access class. Unlisted attributes are public. */
export const GUIDE_ACCESS: Readonly<Record<string, AccessClass>> = {
    // Identifiers: raw EORI/GLN identifiers are restricted even though the
    // surrounding info blocks are public.
    DateOfPuttingTheBatteryIntoService: LI,
    BatteryStatus: LI,
    UniqueEconomicOperatorIdentifier: LI,
    UniqueManufacturerIdentifier: LI,
    UniqueFacilityIdentifier: LI,
    // Performance and durability (dynamic/telemetry attributes are LI)
    RemainingCapacity: LI,
    CapacityFade: LI,
    RemainingUsableBatteryEnergy: LI,
    StateOfCertifiedEnergySOCE: LI,
    StateOfChargeSoC: LI,
    RemainingPowerCapability: LI,
    PowerFade: LI,
    EnergyRoundTripEfficiencyFade: LI,
    RemainingRoundTripEnergyEfficiency: LI,
    InitialSelfDischargeRate: LI,
    CurrentSelfDischargeRate: LI,
    EvolutionOfSelfDischargeRates: LI,
    InternalResistanceIncreaseOfPackCellAndModuleRecommended: LI,
    ExpectedLifetimeInCalendarYears: LI,
    NumberOfFullChargingAndDischargingCycles: LI,
    EnergyThroughput: LI,
    CapacityThroughput: LI,
    TemperatureInformation: LI,
    TimeSpentInExtremeTemperaturesAboveBoundary: LI,
    TimeSpentInExtremeTemperaturesBelowBoundary: LI,
    TimeSpentChargingDuringExtremeTemperaturesAboveBoundary: LI,
    TimeSpentChargingDuringExtremeTemperaturesBelowBoundary: LI,
    NumberOfDeepDischargeEvents: LI,
    NumberOfOverchargeEvents: LI,
    InformationOnAccidents: LI,
    // Materials and composition
    MaterialsUsedInCathodeAnodeAndElectrolyte: LI,
    // Circularity (LI + Commission class in the longlist)
    'DismantlingInformation-ManualsForTheRemovalAndTheDisassemblyOfTheBatteryPack': LI,
    PartNumbersForComponents: LI,
    InformationOnSourcesOfSpareParts: LI,
    SafetyMeasures: LI,
    // Symbols, labels and documentation of conformity
    ResultsOfTestReportsProvingCompliance: 'authority',
};

export const BATTERY_DOCUMENT: DocumentProfile = {
    rootKey: 'Battery_Passport',
    identifiersSection: 'IdentifiersAndProductData',
    dppIdAttribute: 'UniqueBatteryPassportIdentifierUniqueDPPIdentifier',
    productIdAttribute: 'UniqueBatteryIdentifierUniqueProductIdentifier',
    operatorIdAttribute: 'UniqueEconomicOperatorIdentifier',
    statusAttribute: 'DPPStatus',
    statusValueKey: 'dppStatusValue',
    lastUpdateAttribute: 'Date-timeOfLatestUpdateOfDPP',
    access: GUIDE_ACCESS,
    idPrefix: 'urn:odatano:dpp:',
};
