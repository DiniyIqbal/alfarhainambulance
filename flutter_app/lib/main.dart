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
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF070B14),
        primaryColor: const Color(0xFF0EA5E9),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF0B1220),
          elevation: 0,
        ),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF0EA5E9),
          secondary: Color(0xFF10B981),
          surface: Color(0xFF111B31),
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
        backgroundColor: const Color(0xFF0B1220),
        selectedItemColor: const Color(0xFF0EA5E9),
        unselectedItemColor: Colors.white54,
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
