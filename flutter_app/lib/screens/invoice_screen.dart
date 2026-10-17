import 'package:flutter/material.dart';
import '../models/trip_model.dart';

class InvoiceScreen extends StatelessWidget {
  final AmbulanceHub hub;
  final String destination;
  final TripCalculationResult result;
  final AssistancePackage assistance;

  const InvoiceScreen({
    super.key,
    required this.hub,
    required this.destination,
    required this.result,
    required this.assistance,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('INVOIS RASMI AMC AMBULANS'),
        actions: [
          IconButton(
            icon: const Icon(Icons.share),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Butiran Invois Berjaya Disalin ke Papan Keratan')),
              );
            },
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Center(
          child: Container(
            constraints: const BoxConstraints(maxWidth: 600),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              boxShadow: const [
                BoxShadow(color: Colors.black26, blurRadius: 15, offset: Offset(0, 5))
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'PUSAT RAWATAN AL-FARHAIN',
                          style: TextStyle(color: Color(0xFF0369A1), fontWeight: FontWeight.w900, fontSize: 16),
                        ),
                        Text(hub.address, style: const TextStyle(fontSize: 10, color: Colors.black54)),
                        Text('Talian 24 Jam: ${hub.hotline}', style: const TextStyle(fontSize: 10, color: Colors.black87, fontWeight: FontWeight.bold)),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE0F2FE),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text('INVOIS DISAHKAN',
                          style: TextStyle(color: Color(0xFF0369A1), fontWeight: FontWeight.bold, fontSize: 10)),
                    ),
                  ],
                ),
                const Divider(height: 32, thickness: 1.5, color: Color(0xFF0EA5E9)),

                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('KENDERAAN & PEMANDU:', style: TextStyle(fontSize: 10, color: Colors.grey, fontWeight: FontWeight.bold)),
                        Text('No. Plat: ${hub.plateNumber}', style: const TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
                        Text('Pemandu: ${hub.driverName}', style: const TextStyle(color: Colors.black87, fontSize: 12)),
                      ],
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        const Text('LALUAN PERJALANAN:', style: TextStyle(fontSize: 10, color: Colors.grey, fontWeight: FontWeight.bold)),
                        Text('${result.distanceKm.toStringAsFixed(1)} KM', style: const TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
                        Text(destination, style: const TextStyle(color: Colors.black87, fontSize: 12)),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                Table(
                  columnWidths: const {
                    0: FlexColumnWidth(4),
                    1: FlexColumnWidth(2),
                  },
                  children: [
                    _buildTableRow('Tambang Asas (&le; 25 KM)', 'RM ${result.baseFare.toStringAsFixed(2)}', isHeader: true),
                    if (result.extraKm > 0)
                      _buildTableRow('Caj Lebihan Jarak (${result.extraKm.toStringAsFixed(1)} KM @ RM ${result.extraKmRate.toStringAsFixed(2)})',
                          'RM ${result.extraKmCost.toStringAsFixed(2)}'),
                    if (result.assistanceCost > 0)
                      _buildTableRow('Pakej Staf: ${assistance.name}', 'RM ${result.assistanceCost.toStringAsFixed(2)}'),
                    if (result.equipmentCost > 0)
                      _buildTableRow('Peralatan Tambahan & Ubatan', 'RM ${result.equipmentCost.toStringAsFixed(2)}'),
                    if (result.miscFee > 0)
                      _buildTableRow('Lain-lain Caj Pengurusan', 'RM ${result.miscFee.toStringAsFixed(2)}'),
                  ],
                ),
                const Divider(height: 32),

                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0FDF4),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFF86EFAC)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('JUMLAH BAYARAN:',
                          style: TextStyle(color: Color(0xFF166534), fontWeight: FontWeight.bold, fontSize: 14)),
                      Text('RM ${result.grandTotal.toStringAsFixed(2)}',
                          style: const TextStyle(
                            color: Color(0xFF15803D),
                            fontWeight: FontWeight.w900,
                            fontSize: 24,
                          )),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                ElevatedButton.icon(
                  icon: const Icon(Icons.check_circle),
                  label: const Text('SELESAI & KEMBALI'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0369A1),
                    foregroundColor: Colors.white,
                    minimumSize: const Size.fromHeight(46),
                  ),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  TableRow _buildTableRow(String title, String val, {bool isHeader = false}) {
    return TableRow(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Text(title, style: TextStyle(color: Colors.black87, fontWeight: isHeader ? FontWeight.bold : FontWeight.normal, fontSize: 12)),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Text(val, textAlign: TextAlign.right, style: const TextStyle(color: Colors.black, fontWeight: FontWeight.bold, fontSize: 12)),
        ),
      ],
    );
  }
}
