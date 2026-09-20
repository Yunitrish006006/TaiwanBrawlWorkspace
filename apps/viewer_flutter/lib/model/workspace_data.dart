class WorkspaceData {
  const WorkspaceData({
    required this.repositories,
    required this.relationships,
    required this.contracts,
  });
  final List<RepositoryData> repositories;
  final List<RelationshipData> relationships;
  final List<ContractData> contracts;
  factory WorkspaceData.fromJson(Map<String, dynamic> json) => WorkspaceData(
        repositories: _maps(
          json['repositories']?['repositories'],
        ).map(RepositoryData.fromJson).toList(),
        relationships: _maps(
          json['relationships']?['relationships'],
        ).map(RelationshipData.fromJson).toList(),
        contracts: _maps(
          json['contracts']?['contracts'],
        ).map(ContractData.fromJson).toList(),
      );
}

class RepositoryData {
  const RepositoryData({
    required this.id,
    required this.name,
    required this.kind,
    required this.version,
    required this.commit,
    required this.role,
    required this.repository,
  });
  final String id, name, kind, version, commit, role, repository;
  factory RepositoryData.fromJson(Map<String, dynamic> json) => RepositoryData(
        id: '${json['id'] ?? ''}',
        name: '${json['name'] ?? ''}',
        kind: '${json['kind'] ?? ''}',
        version: '${json['version'] ?? ''}',
        commit: '${json['commit'] ?? ''}',
        role: '${json['role'] ?? ''}',
        repository: '${json['repository'] ?? ''}',
      );
}

class RelationshipData {
  const RelationshipData({
    required this.id,
    required this.from,
    required this.to,
    required this.classification,
    required this.protocol,
    required this.ownership,
    required this.notes,
  });
  final String id, from, to, classification, protocol, ownership;
  final List<String> notes;
  factory RelationshipData.fromJson(Map<String, dynamic> json) =>
      RelationshipData(
        id: '${json['id'] ?? ''}',
        from: '${json['from'] ?? ''}',
        to: '${json['to'] ?? ''}',
        classification: '${json['classification'] ?? ''}',
        protocol: '${json['protocol'] ?? ''}',
        ownership: '${json['ownership'] ?? ''}',
        notes: _strings(json['notes']),
      );
}

class ContractData {
  const ContractData(
      {required this.id,
      required this.owners,
      required this.consumers,
      required this.invariants});
  final String id;
  final List<String> owners, consumers, invariants;
  factory ContractData.fromJson(Map<String, dynamic> json) => ContractData(
        id: '${json['id'] ?? ''}',
        owners: _strings(json['owners']),
        consumers: _strings(json['consumers']),
        invariants: _strings(json['invariants']),
      );
}

List<Map<String, dynamic>> _maps(Object? value) => value is List
    ? value
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList()
    : <Map<String, dynamic>>[];
List<String> _strings(Object? value) =>
    value is List ? value.whereType<String>().toList() : <String>[];
