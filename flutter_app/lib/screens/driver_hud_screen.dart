import 'package:flutter/material.dart';

class DriverHudScreen extends StatefulWidget {
  const DriverHudScreen({super.key});

  @override
  State<DriverHudScreen> createState() => _DriverHudScreenState();
}

class _DriverHudScreenState extends State<DriverHudScreen> {
  int _currentStage = 2; // 1: Dispatched, 2: En Route, 3: On Scene, 4: In Transit, 5: Arrived

  final List<String> _stages = [
    '1. Pesanan Diterima (Dispatched)',
    '2. Menuju Lokasi Pesakit (En Route)',
    '3. Tiba di Lokasi Pesakit (On Scene)',
    '4. Membawa Pesakit (In Transit)',
    '5. Tiba di Destinasi & Selesai (Arrived)',
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('KOKPIT PEMANDU AMBULANS'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Card(
              color: const Color(0xFF111B31),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    const CircleAvatar(
                      radius: 28,
                      backgroundColor: Color(0xFF0EA5E9),
                      child: Text('👨‍✈️', style: TextStyle(fontSize: 28)),
                    ),
                    const SizedBox(width: 14),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Abe Di / Syalihan', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                          Text('No. Plat: VPQ 7606 (HQ Kok Lanas)', style: TextStyle(color: Color(0xFF0EA5E9), fontSize: 12)),
                          Text('Hotline 24 Jam: 013-914 7606', style: TextStyle(color: Colors.white60, fontSize: 11)),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981).withOpacity(0.2),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: const Color(0xFF10B981)),
                      ),
                      child: const Text('AKTIF', style: TextStyle(color: Color(0xFF10B981), fontWeight: FontWeight.bold, fontSize: 11)),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            Card(
              color: const Color(0xFF111B31),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('STATUS MISI AMBULANS TERKINI:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Colors.white70)),
                    const SizedBox(height: 12),
                    for (int i = 0; i < _stages.length; i++) ...[
                      ListTile(
                        leading: CircleAvatar(
                          radius: 14,
                          backgroundColor: i + 1 < _currentStage
                              ? const Color(0xFF10B981)
                              : (i + 1 == _currentStage ? const Color(0xFF0EA5E9) : Colors.white12),
                          child: Text(
                            i + 1 < _currentStage ? '✓' : '${i + 1}',
                            style: TextStyle(
                              color: i + 1 <= _currentStage ? Colors.black : Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 12,
                            ),
                          ),
                        ),
                        title: Text(
                          _stages[i],
                          style: TextStyle(
                            fontWeight: i + 1 == _currentStage ? FontWeight.bold : FontWeight.normal,
                            color: i + 1 == _currentStage ? Colors.white : Colors.white60,
                            fontSize: 13,
                          ),
                        ),
                        dense: true,
                        onTap: () {
                          setState(() => _currentStage = i + 1);
                        },
                      ),
                    ],
                    const SizedBox(height: 12),
                    ElevatedButton.icon(
                      icon: const Icon(Icons.fast_forward),
                      label: Text(_currentStage >= 5 ? 'RESET MISI' : 'KEMASKINI STATUS SETERUSNYA'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF0EA5E9),
                        foregroundColor: Colors.white,
                        minimumSize: const Size.fromHeight(46),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      onPressed: () {
                        setState(() {
                          _currentStage = _currentStage >= 5 ? 1 : _currentStage + 1;
                        });
                      },
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
