// Trip Data Models for Al-Farhain Ambulance App

class AmbulanceHub {
  final String id;
  final String name;
  final String shortName;
  final String state;
  final double lat;
  final double lng;
  final String plateNumber;
  final String driverName;
  final String hotline;
  final String operatingHours;
  final String address;

  const AmbulanceHub({
    required this.id,
    required this.name,
    required this.shortName,
    required this.state,
    required this.lat,
    required this.lng,
    required this.plateNumber,
    required this.driverName,
    required this.hotline,
    required this.operatingHours,
    required this.address,
  });
}

class PresetHospital {
  final String id;
  final String name;
  final String shortName;
  final String category;
  final double distanceFromHQ;
  final double lat;
  final double lng;
  final int estMinutes;

  const PresetHospital({
    required this.id,
    required this.name,
    required this.shortName,
    required this.category,
    required this.distanceFromHQ,
    required this.lat,
    required this.lng,
    required this.estMinutes,
  });
}

class TripCategory {
  final String id;
  final String name;
  final double baseFare;
  final String description;
  final String badge;

  const TripCategory({
    required this.id,
    required this.name,
    required this.baseFare,
    required this.description,
    required this.badge,
  });
}

class AssistancePackage {
  final String id;
  final String name;
  final String roleTitle;
  final double price;
  final String description;
  final List<String> skills;

  const AssistancePackage({
    required this.id,
    required this.name,
    required this.roleTitle,
    required this.price,
    required this.description,
    required this.skills,
  });
}

class EquipmentItem {
  final String id;
  final String name;
  final String category;
  final double price;
  final String priceRange;
  final String unit;
  final String icon;
  final String description;
  final int maxQty;

  const EquipmentItem({
    required this.id,
    required this.name,
    required this.category,
    required this.price,
    required this.priceRange,
    required this.unit,
    required this.icon,
    required this.description,
    this.maxQty = 3,
  });
}

class TripCalculationResult {
  final double distanceKm;
  final double baseKm;
  final double extraKm;
  final double baseFare;
  final double extraKmRate;
  final double extraKmCost;
  final double assistanceCost;
  final double equipmentCost;
  final double miscFee;
  final double grandTotal;

  const TripCalculationResult({
    required this.distanceKm,
    required this.baseKm,
    required this.extraKm,
    required this.baseFare,
    required this.extraKmRate,
    required this.extraKmCost,
    required this.assistanceCost,
    required this.equipmentCost,
    required this.miscFee,
    required this.grandTotal,
  });
}
