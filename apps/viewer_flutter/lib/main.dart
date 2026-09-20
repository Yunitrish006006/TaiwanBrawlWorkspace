import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'model/graph_scene.dart';
import 'model/workspace_data.dart';
import 'widgets/graph_view.dart';

void main() => runApp(const WorkspaceApp());

class WorkspaceApp extends StatelessWidget {
  const WorkspaceApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'TaiwanBrawlWorkspace',
        theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.blue),
        home: const WorkspaceHome(),
      );
}

class WorkspaceHome extends StatefulWidget {
  const WorkspaceHome({super.key});
  @override
  State<WorkspaceHome> createState() => _WorkspaceHomeState();
}

class _WorkspaceHomeState extends State<WorkspaceHome> {
  WorkspaceData? data;
  String? error;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final raw = kIsWeb
          ? (await http.get(Uri.base.resolve('data/workspace-data.json'))).body
          : await rootBundle.loadString('assets/workspace-data.json');
      if (kIsWeb && raw.isEmpty) {
        throw StateError('workspace data response was empty');
      }
      setState(
        () => data = WorkspaceData.fromJson(
          jsonDecode(raw) as Map<String, dynamic>,
        ),
      );
    } catch (e) {
      setState(() => error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (error != null) {
      return Scaffold(
          appBar: AppBar(title: const Text('TaiwanBrawlWorkspace')),
          body: Center(child: Text(error!)));
    }
    final current = data;
    if (current == null) {
      return Scaffold(
          appBar: AppBar(title: const Text('TaiwanBrawlWorkspace')),
          body: const Center(child: CircularProgressIndicator()));
    }
    return Scaffold(
      appBar: AppBar(title: const Text('TaiwanBrawlWorkspace')),
      body: GraphView(data: current, scene: buildGraphScene(current)),
    );
  }
}
