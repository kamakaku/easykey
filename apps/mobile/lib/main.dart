import 'package:flutter/material.dart';

void main() => runApp(const EasyKeyApp());

class EasyKeyApp extends StatelessWidget {
  const EasyKeyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'EasyKey',
      theme: ThemeData.dark(useMaterial3: true),
      home: const HomePage(),
    );
  }
}

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('EasyKey')),
      body: const Center(child: Text('Flutter stub is ready.')),
    );
  }
}
