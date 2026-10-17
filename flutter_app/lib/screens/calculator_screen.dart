import 'package:flutter/material.dart';
import '../models/trip_model.dart';
import '../services/pricing_service.dart';
import 'invoice_screen.dart';

class CalculatorScreen extends StatefulWidget {
  const CalculatorScreen({super.key});

  @override
  State<CalculatorScreen> createState() => _CalculatorScreenState();
}

class _CalculatorScreenState extends State<CalculatorScreen> {
  AmbulanceHub _currentHub = PricingService.kokLanasHub;
  PresetHospital _selectedHospital = PricingService.presetHospitals[0];
  double _distanceKm = 27.2;
  TripCategory _selectedCategory = PricingService.tripCategories[0];
  AssistancePackage _selectedAssistance = PricingService.assistancePackages[0];
  final Map<String, int> _equipmentQuantities = {};
  bool _isDieselSurge = false;
  bool _includeMiscFee = true;

  @override
  void initState() {
    super.initState();
    for (var eq in PricingService.equipmentItems) {
      _equipmentQuantities[eq.id] = 0;
    }
  }

  TripCalculationResult get _result {
    return PricingService.calculate(
      distanceKm: _distanceKm,
      tripCategory: _selectedCategory,
      assistance: _selectedAssistance,
      equipmentQuantities: _equipmentQuantities,
      isDieselSurge: _isDieselSurge,
      includeMiscFee: _includeMiscFee,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDesktop = MediaQuery.of(context).size.width > 900;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'AMC AMBULANS CALCULATOR',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
            ),
            Text(
              'Pusat Rawatan Al-Farhain • ${_currentHub.shortName}',
              style: const TextStyle(fontSize: 11, color: Colors.white70),
            ),
          ],
        ),
        actions: [
          DropdownButton<String>(
            value: _currentHub.id,
            dropdownColor: const Color(0xFF0F172A),
            underline: const SizedBox(),
            icon: const Icon(Icons.location_on, color: Color(0xFF0EA5E9)),
            items: const [
              DropdownMenuItem(value: 'kok_lanas', child: Text('HQ Kok Lanas (Kelantan)')),
              DropdownMenuItem(value: 'raub', child: Text('Cawangan Raub (Pahang)')),
            ],
            onChanged: (val) {
              if (val != null) {
                setState(() {
                  _currentHub = val == 'raub' ? PricingService.raubHub : PricingService.kokLanasHub;
                });
              }
            },
          ),
          const SizedBox(width: 12),
        ],
      ),
      body: isDesktop ? _buildDesktopLayout() : _buildMobileLayout(),
    );
  }

  Widget _buildDesktopLayout() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 6,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: _buildFormSections(),
          ),
        ),
        Container(
          width: 420,
          padding: const EdgeInsets.all(20),
          decoration: const BoxDecoration(
            color: Color(0xFF0B1220),
            border: Border(left: BorderSide(color: Colors.white10)),
          ),
          child: SingleChildScrollView(
            child: _buildSummaryCard(),
          ),
        ),
      ],
    );
  }

  Widget _buildMobileLayout() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          _buildFormSections(),
          const SizedBox(height: 20),
          _buildSummaryCard(),
        ],
      ),
    );
  }

  Widget _buildFormSections() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader('1. LOKASI & KIRAAN JARAK (KM)', Icons.route),
        _buildLocationCard(),
        const SizedBox(height: 20),

        _buildSectionHeader('2. KATEGORI KECEMASAN', Icons.emergency),
        _buildTripCategories(),
        const SizedBox(height: 20),

        _buildSectionHeader('3. BANTUAN PEGAWAI PERUBATAN (M.A, C.A, DR)', Icons.medical_services),
        _buildAssistancePackages(),
        const SizedBox(height: 20),

        _buildSectionHeader('4. PERALATAN & UBATAN TRANSIT', Icons.healing),
        _buildEquipmentGrid(),
      ],
    );
  }

  Widget _buildSectionHeader(String title, IconData icon) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Icon(icon, color: const Color(0xFF0EA5E9), size: 20),
          const SizedBox(width: 8),
          Text(
            title,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, letterSpacing: 0.5),
          ),
        ],
      ),
    );
  }

  Widget _buildLocationCard() {
    return Card(
      color: const Color(0xFF111B31),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: Colors.white12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Pusat Operasi Asal (Pickup Point):', style: TextStyle(fontSize: 12, color: Colors.white70)),
            const SizedBox(height: 4),
            Text(_currentHub.name, style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
            Text('No. Plat Ambulans: ${_currentHub.plateNumber} • Pemandu: ${_currentHub.driverName}',
                style: const TextStyle(fontSize: 11, color: Color(0xFF0EA5E9))),
            const Divider(color: Colors.white10, height: 24),

            const Text('Destinasi Hospital / Penghantaran:', style: TextStyle(fontSize: 12, color: Colors.white70)),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: _selectedHospital.id,
              dropdownColor: const Color(0xFF0F172A),
              decoration: InputDecoration(
                filled: true,
                fillColor: const Color(0xFF0B1220),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
              items: PricingService.presetHospitals.map((h) {
                return DropdownMenuItem(
                  value: h.id,
                  child: Text('${h.shortName} (${h.distanceFromHQ} KM)'),
                );
              }).toList(),
              onChanged: (val) {
                if (val != null) {
                  setState(() {
                    _selectedHospital = PricingService.presetHospitals.firstWhere((h) => h.id == val);
                    _distanceKm = _selectedHospital.distanceFromHQ;
                  });
                }
              },
            ),
            const SizedBox(height: 16),

            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Jarak Perjalanan: ${_distanceKm.toStringAsFixed(1)} KM',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                Text(_distanceKm > 25.0 ? '+${(_distanceKm - 25.0).toStringAsFixed(1)} KM dari basis' : 'Dalam linkungan basis (<25 KM)',
                    style: TextStyle(
                      fontSize: 12,
                      color: _distanceKm > 25.0 ? const Color(0xFFF59E0B) : const Color(0xFF10B981),
                    )),
              ],
            ),
            Slider(
              value: _distanceKm.clamp(1.0, 400.0),
              min: 1.0,
              max: 400.0,
              divisions: 399,
              activeColor: const Color(0xFF0EA5E9),
              onChanged: (val) {
                setState(() {
                  _distanceKm = val;
                });
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTripCategories() {
    return Column(
      children: PricingService.tripCategories.map((cat) {
        final isSelected = _selectedCategory.id == cat.id;
        return Card(
          color: isSelected ? const Color(0xFF1E293B) : const Color(0xFF111B31),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(color: isSelected ? const Color(0xFF0EA5E9) : Colors.white10),
          ),
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            leading: Icon(
              isSelected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: isSelected ? const Color(0xFF0EA5E9) : Colors.white54,
            ),
            title: Text(cat.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            subtitle: Text(cat.description, style: const TextStyle(fontSize: 11, color: Colors.white60)),
            trailing: Text('RM ${cat.baseFare.toStringAsFixed(2)}',
                style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF0EA5E9))),
            onTap: () {
              setState(() => _selectedCategory = cat);
            },
          ),
        );
      }).toList(),
    );
  }

  Widget _buildAssistancePackages() {
    return Column(
      children: PricingService.assistancePackages.map((pkg) {
        final isSelected = _selectedAssistance.id == pkg.id;
        return Card(
          color: isSelected ? const Color(0xFF064E3B).withOpacity(0.4) : const Color(0xFF111B31),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(color: isSelected ? const Color(0xFF10B981) : Colors.white10),
          ),
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            leading: Icon(
              isSelected ? Icons.check_circle : Icons.circle_outlined,
              color: isSelected ? const Color(0xFF10B981) : Colors.white54,
            ),
            title: Text(pkg.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            subtitle: Text(pkg.description, style: const TextStyle(fontSize: 11, color: Colors.white60)),
            trailing: Text(
              pkg.price == 0 ? 'PERCUMA' : '+RM ${pkg.price.toStringAsFixed(2)}',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: isSelected ? const Color(0xFF10B981) : Colors.white70,
              ),
            ),
            onTap: () {
              setState(() => _selectedAssistance = pkg);
            },
          ),
        );
      }).toList(),
    );
  }

  Widget _buildEquipmentGrid() {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        childAspectRatio: 2.8,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
      ),
      itemCount: PricingService.equipmentItems.length,
      itemBuilder: (context, idx) {
        final eq = PricingService.equipmentItems[idx];
        final qty = _equipmentQuantities[eq.id] ?? 0;
        return Card(
          color: qty > 0 ? const Color(0xFF0EA5E9).withOpacity(0.12) : const Color(0xFF111B31),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
            side: BorderSide(color: qty > 0 ? const Color(0xFF0EA5E9) : Colors.white10),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            child: Row(
              children: [
                Text(eq.icon, style: const TextStyle(fontSize: 22)),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(eq.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                      Text('RM ${eq.price.toStringAsFixed(0)}',
                          style: const TextStyle(fontSize: 11, color: Color(0xFF0EA5E9))),
                    ],
                  ),
                ),
                Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.remove, size: 16),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: qty > 0
                          ? () => setState(() => _equipmentQuantities[eq.id] = qty - 1)
                          : null,
                    ),
                    Text('$qty', style: const TextStyle(fontWeight: FontWeight.bold)),
                    IconButton(
                      icon: const Icon(Icons.add, size: 16),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: qty < eq.maxQty
                          ? () => setState(() => _equipmentQuantities[eq.id] = qty + 1)
                          : null,
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildSummaryCard() {
    final res = _result;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Card(
          color: const Color(0xFF111B31),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: Color(0xFF0EA5E9), width: 1.5),
          ),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('RINGKASAN ANGGARAN', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                    Chip(
                      label: Text('FORMULA EXCEL AMC', style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold)),
                      backgroundColor: Color(0xFF0B1220),
                    ),
                  ],
                ),
                const Divider(color: Colors.white12),

                _buildBillRow('Kategori Trip Asas', 'RM ${res.baseFare.toStringAsFixed(2)}'),
                _buildBillRow('Jarak Asas (<25 KM)', 'Termasuk (RM 250)'),
                _buildBillRow('Caj Tambahan Jarak (${res.extraKm.toStringAsFixed(1)} KM)',
                    'RM ${res.extraKmCost.toStringAsFixed(2)}'),
                _buildBillRow('Pakej Bantuan Staf', 'RM ${res.assistanceCost.toStringAsFixed(2)}'),
                _buildBillRow('Peralatan & Ubatan', 'RM ${res.equipmentCost.toStringAsFixed(2)}'),
                _buildBillRow('Lain-lain Caj', 'RM ${res.miscFee.toStringAsFixed(2)}'),

                const Divider(color: Colors.white12),
                CheckboxListTile(
                  value: _isDieselSurge,
                  title: const Text('Mod Kenaikan Diesel (RM 4.50/KM)', style: TextStyle(fontSize: 11)),
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  onChanged: (val) => setState(() => _isDieselSurge = val ?? false),
                ),

                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0B1220),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFF0EA5E9)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('JUMLAH BESAR:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                      Text('RM ${res.grandTotal.toStringAsFixed(2)}',
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            color: Color(0xFF0EA5E9),
                          )),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                ElevatedButton.icon(
                  icon: const Icon(Icons.receipt_long),
                  label: const Text('JANA INVOIS & SAHKAN TEMPAHAN'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0EA5E9),
                    foregroundColor: Colors.white,
                    minimumSize: const Size.fromHeight(48),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => InvoiceScreen(
                          hub: _currentHub,
                          destination: _selectedHospital.name,
                          result: res,
                          assistance: _selectedAssistance,
                        ),
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildBillRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 12, color: Colors.white70)),
          Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
