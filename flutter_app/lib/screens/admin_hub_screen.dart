import 'package:flutter/material.dart';

class AdminHubScreen extends StatelessWidget {
  const AdminHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('PUSAT ANALITIK & PENGURUSAN AMC'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _buildMetricCard('Jumlah Trip', '142', Icons.local_shipping, const Color(0xFF0EA5E9)),
                const SizedBox(width: 12),
                _buildMetricCard('Jumlah Hasil', 'RM 48,250', Icons.payments, const Color(0xFF10B981)),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _buildMetricCard('Armada Sedia', '2 / 2 Unit', Icons.verified, const Color(0xFFF59E0B)),
                const SizedBox(width: 12),
                _buildMetricCard('Purata Respons', '8.4 Minit', Icons.timer, const Color(0xFFEC4899)),
              ],
            ),
            const SizedBox(height: 24),

            const Text('LOG PENGURUSAN TRIP TERKINI:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
            const SizedBox(height: 12),

            Card(
              color: const Color(0xFF111B31),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              child: ListView(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: const [
                  ListTile(
                    title: Text('INV-AMC-1042 • HQ Kok Lanas ➔ HRPZ II', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    subtitle: Text('27.2 KM • Pakej M.A (PPP) • Oksigen (1)', style: TextStyle(fontSize: 11, color: Colors.white60)),
                    trailing: Text('RM 556.60', style: TextStyle(color: Color(0xFF0EA5E9), fontWeight: FontWeight.bold)),
                  ),
                  Divider(height: 1, color: Colors.white10),
                  ListTile(
                    title: Text('INV-AMC-1041 • HQ Kok Lanas ➔ Hosp Machang', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    subtitle: Text('18.0 KM • Krew EMT Standard', style: TextStyle(fontSize: 11, color: Colors.white60)),
                    trailing: Text('RM 300.00', style: TextStyle(color: Color(0xFF0EA5E9), fontWeight: FontWeight.bold)),
                  ),
                  Divider(height: 1, color: Colors.white10),
                  ListTile(
                    title: Text('INV-AMC-1040 • Caw. Raub ➔ Hosp Kuala Lipis', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    subtitle: Text('42.5 KM • Pakej C.A • IV Drip (2)', style: TextStyle(fontSize: 11, color: Colors.white60)),
                    trailing: Text('RM 452.50', style: TextStyle(color: Color(0xFF0EA5E9), fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMetricCard(String title, String val, IconData icon, Color color) {
    return Expanded(
      child: Card(
        color: const Color(0xFF111B31),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: color, size: 24),
              const SizedBox(height: 8),
              Text(title, style: const TextStyle(fontSize: 11, color: Colors.white60)),
              Text(val, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: Colors.white)),
            ],
          ),
        ),
      ),
    );
  }
}
