import 'package:flutter/material.dart';

class FaqBotScreen extends StatefulWidget {
  const FaqBotScreen({super.key});

  @override
  State<FaqBotScreen> createState() => _FaqBotScreenState();
}

class _FaqBotScreenState extends State<FaqBotScreen> {
  final List<Map<String, String>> _messages = [
    {
      'role': 'bot',
      'text': 'Salam sejahtera! Saya pembantu maya Al-Farhain AMC Ambulans. Sila pilih soalan lazim di bawah atau tanyakan sebarang kemusykilan mengenai kadar harga, pakej staf pengiring atau kelengkapan perubatan.'
    }
  ];

  final List<Map<String, String>> _faqItems = [
    {
      'q': 'Berapakah kos asas perkhidmatan ambulan?',
      'a': 'Kadar asas sehingga 25 KM pertama ialah RM 250.00. Setiap KM seterusnya dikenakan caj RM 3.00/KM.'
    },
    {
      'q': 'Apakah beza Pakej M.A, C.A dan Doktor?',
      'a': 'Krew EMT adalah percuma (RM 0). Tambahan Pakej C.A (+RM 100), Pakej M.A PPP (+RM 200), dan Pakej Doktor (+RM 400) mengikut tahap kritikal pesakit.'
    },
    {
      'q': 'Apakah nombor hotline kecemasan?',
      'a': 'Hotline rasmi 24 jam Al-Farhain Ambulans ialah 013-914 7606.'
    },
    {
      'q': 'Adakah bekalan oksigen disediakan?',
      'a': 'Ya, silinder oksigen gred perubatan sentiasa sedia ada dan boleh ditambah dalam pesanan dengan kadar RM 50.'
    },
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('PEMBANTU MAYA FAQ AMBULANS'),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length,
              itemBuilder: (context, idx) {
                final m = _messages[idx];
                final isBot = m['role'] == 'bot';
                return Align(
                  alignment: isBot ? Alignment.centerLeft : Alignment.centerRight,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(14),
                    constraints: const BoxConstraints(maxWidth: 320),
                    decoration: BoxDecoration(
                      color: isBot ? const Color(0xFF111B31) : const Color(0xFF0EA5E9),
                      borderRadius: BorderRadius.circular(14),
                      border: isBot ? Border.all(color: Colors.white10) : null,
                    ),
                    child: Text(
                      m['text'] ?? '',
                      style: const TextStyle(fontSize: 13, height: 1.4),
                    ),
                  ),
                );
              },
            ),
          ),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: const BoxDecoration(
              color: Color(0xFF0B1220),
              border: Border(top: BorderSide(color: Colors.white10)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Soalan Kerap Ditanya (Klik untuk jawapan pantas):',
                    style: TextStyle(fontSize: 11, color: Colors.white60, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: _faqItems.map((item) {
                    return ActionChip(
                      label: Text(item['q']!, style: const TextStyle(fontSize: 11)),
                      backgroundColor: const Color(0xFF1E293B),
                      onPressed: () {
                        setState(() {
                          _messages.add({'role': 'user', 'text': item['q']!});
                          _messages.add({'role': 'bot', 'text': item['a']!});
                        });
                      },
                    );
                  }).toList(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
