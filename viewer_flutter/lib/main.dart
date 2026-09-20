import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

void main() => runApp(const WorkspaceApp());

class WorkspaceApp extends StatelessWidget {
  const WorkspaceApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'TaiwanBrawlWorkspace',
      theme: ThemeData(useMaterial3: true),
      home: const WorkspaceHome(),
    );
  }
}

class WorkspaceHome extends StatefulWidget {
  const WorkspaceHome({super.key});
  @override
  State<WorkspaceHome> createState() => _WorkspaceHomeState();
}

class _WorkspaceHomeState extends State<WorkspaceHome> {
  Map<String, dynamic>? data;
  String? error;
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    try {
      final raw = await rootBundle.loadString('assets/workspace-data.json');
      setState(() => data = jsonDecode(raw) as Map<String, dynamic>);
    } catch (e) { setState(() => error = '$e'); }
  }
  @override
  Widget build(BuildContext context) {
    if (error != null) return Scaffold(body: Center(child: Text(error!)));
    if (data == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final repos = (data!['repositories']['repositories'] as List).cast<Map<String, dynamic>>();
    final rels = (data!['relationships']['relationships'] as List).cast<Map<String, dynamic>>();
    final contracts = (data!['contracts']['contracts'] as List).cast<Map<String, dynamic>>();
    return Scaffold(
      appBar: AppBar(title: const Text('TaiwanBrawlWorkspace')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Repositories', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          ...repos.map((repo) => Card(child: ListTile(
            title: Text(repo['name'] as String),
            subtitle: Text('${repo['kind']} • v${repo['version']}\n${repo['role']}'),
            isThreeLine: true,
            trailing: Text((repo['commit'] as String).substring(0, 7)),
          ))),
          const SizedBox(height: 16),
          Text('Relationships (${rels.length})', style: Theme.of(context).textTheme.headlineSmall),
          ...rels.map((rel) => ListTile(
            dense: true,
            title: Text('${rel['from']} → ${rel['to']}'),
            subtitle: Text(rel['classification'] as String),
          )),
          const SizedBox(height: 16),
          Text('Contracts (${contracts.length})', style: Theme.of(context).textTheme.headlineSmall),
          ...contracts.map((contract) => ExpansionTile(
            title: Text(contract['id'] as String),
            subtitle: Text('owners: ${(contract['owners'] as List).join(', ')}'),
            children: (contract['invariants'] as List).map((x) => ListTile(dense: true, title: Text('• $x'))).toList(),
          )),
        ],
      ),
    );
  }
}
