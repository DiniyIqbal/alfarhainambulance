import 'package:flutter/material.dart';
import 'screens/calculator_screen.dart';
import 'screens/driver_hud_screen.dart';
import 'screens/admin_hub_screen.dart';
import 'screens/faq_bot_screen.dart';

void main() {
  runApp(const AlFarhainAmbulanceApp());
}

class AlFarhainAmbulanceApp extends StatelessWidget {
  const AlFarhainAmbulanceApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Al-Farhain AMC Ambulans',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.light,
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
        primaryColor: const Color(0xFFC61E2F),
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.white,
          foregroundColor: Color(0xFF25313C),
          elevation: 0.5,
          iconTheme: IconThemeData(color: Color(0xFF25313C)),
        ),
        colorScheme: const ColorScheme.light(
          primary: Color(0xFFC61E2F),
          secondary: Color(0xFFFFF0F2),
          surface: Colors.white,
          onPrimary: Colors.white,
          onSurface: Color(0xFF25313C),
        ),
        cardTheme: CardTheme(
          color: Colors.white,
          elevation: 1,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      home: const MainNavigationScreen(),
    );
  }
}

class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  int _currentIndex = 0;

  final List<Widget> _screens = const [
    CalculatorScreen(),
    DriverHudScreen(),
    AdminHubScreen(),
    FaqBotScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _screens[_currentIndex],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        type: BottomNavigationBarType.fixed,
        backgroundColor: Colors.white,
        selectedItemColor: const Color(0xFFC61E2F),
        unselectedItemColor: const Color(0xFF64748B),
        onTap: (index) {
          setState(() {
            _currentIndex = index;
          });
        },
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.calculate),
            label: 'Kalkulator',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.speed),
            label: 'Kokpit Pemandu',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.dashboard),
            label: 'Pengurusan',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.help_center),
            label: 'FAQ AI',
          ),
        ],
      ),
    );
  }
}
