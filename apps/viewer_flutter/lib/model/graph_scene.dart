import 'dart:math' as math;
import 'dart:ui';
import 'workspace_data.dart';

class Vec3 {
  const Vec3(this.x, this.y, this.z);
  final double x, y, z;
}

class GraphNode {
  const GraphNode(
      {required this.id,
      required this.label,
      required this.kind,
      required this.details,
      required this.repository,
      required this.position,
      required this.degree,
      required this.contractCount,
      this.parentId});
  final String id, label, kind, details;
  final RepositoryData repository;
  final Vec3 position;
  final int degree, contractCount;
  final String? parentId;
  bool get isChild => parentId != null;
}

class GraphEdge {
  const GraphEdge(
      {required this.id,
      required this.from,
      required this.to,
      required this.label,
      required this.classification});
  final String id, from, to, label, classification;
}

class GraphScene {
  const GraphScene({required this.nodes, required this.edges});
  final List<GraphNode> nodes;
  final List<GraphEdge> edges;
}

GraphScene buildGraphScene(WorkspaceData data) {
  final roots = <GraphNode>[];
  final nodes = <GraphNode>[];
  final edges = <GraphEdge>[];
  for (var i = 0; i < data.repositories.length; i++) {
    final repo = data.repositories[i];
    final rootPosition = _fibonacciPoint(i, data.repositories.length, 260);
    final degree = data.relationships
        .where((edge) => edge.from == repo.id || edge.to == repo.id)
        .length;
    final contracts = data.contracts
        .where((contract) =>
            contract.owners.contains(repo.id) ||
            contract.consumers.contains(repo.id))
        .length;
    final root = GraphNode(
        id: repo.id,
        label: repo.name,
        kind: 'repository',
        details: repo.role,
        repository: repo,
        position: rootPosition,
        degree: degree,
        contractCount: contracts);
    roots.add(root);
    nodes.add(root);
    final features = _featuresFor(repo);
    for (var childIndex = 0; childIndex < features.length; childIndex++) {
      final feature = features[childIndex];
      final childId = '${repo.id}:$childIndex';
      final childPosition =
          _childPoint(rootPosition, childIndex, features.length, 92);
      nodes.add(GraphNode(
          id: childId,
          label: feature.$1,
          kind: 'subsystem',
          details: feature.$2,
          repository: repo,
          position: childPosition,
          degree: 0,
          contractCount: 0,
          parentId: repo.id));
      edges.add(GraphEdge(
          id: 'detail:$childId',
          from: repo.id,
          to: childId,
          label: 'subsystem',
          classification: 'system-detail'));
    }
  }
  for (final relation in data.relationships) {
    edges.add(GraphEdge(
        id: relation.id,
        from: relation.from,
        to: relation.to,
        label: relation.protocol.isEmpty
            ? relation.classification
            : relation.protocol,
        classification: relation.classification));
  }
  return GraphScene(nodes: nodes, edges: edges);
}

List<(String, String)> _featuresFor(RepositoryData repo) {
  if (repo.id == 'user-ui-settings') {
    return [
      ('Theme Provider', '設定明暗主題、色彩與 Material theme'),
      ('Locale Provider', '切換語系、文字資源與本地化設定'),
      ('Font Scale', '調整字體縮放與可讀性'),
      ('User Preferences', '保存 UI 偏好並提供跨頁面讀取')
    ];
  }
  if (repo.id == 'user-basic-system') {
    return [
      ('Profile System', '使用者基本資料與 profile abstraction'),
      ('Direct Message Model', 'DM 對話、訊息與收件匣資料模型'),
      ('Reusable Chat Abstraction', '提供前端可重用的聊天介面與狀態')
    ];
  }
  if (repo.id == 'taiwan-brawl-front') {
    return [
      ('Flutter UX', '頁面、導航、主題整合與互動介面'),
      ('Social & Chat', '好友、私訊、通知與社交體驗'),
      ('Royale UI', '大逃殺 lobby、戰鬥畫面與牌組介面'),
      ('FCM Client', '註冊裝置 token 並接收推播'),
      ('Web Session Client', 'Cookie / Bearer session 與 API client')
    ];
  }
  if (repo.id == 'taiwan-brawl-back') {
    return [
      ('API & Sessions', 'HTTP API、登入 session 與使用者資料'),
      ('D1 Persistence', '資料表、查詢與持久化狀態'),
      ('KV Assets', 'Flutter Web 靜態資產與版本化檔案'),
      ('Royale Room', 'ROYALE_ROOM Durable Object 即時房間狀態'),
      ('FCM Delivery', '後端推播發送與通知佇列'),
      ('Integrated Deploy', '建置 frontend、上傳 KV 並部署 Worker')
    ];
  }
  return [('Core Responsibilities', repo.role)];
}

Offset projectPoint(Vec3 point, Size size,
    {double yaw = -.48, double pitch = .22, double zoom = 1}) {
  final cy = math.cos(yaw),
      sy = math.sin(yaw),
      cp = math.cos(pitch),
      sp = math.sin(pitch);
  final x = point.x * cy - point.z * sy;
  var z = point.x * sy + point.z * cy;
  final y = point.y * cp - z * sp;
  z = point.y * sp + z * cp;
  final scale = zoom * 520 / math.max(200, 760 + z);
  return Offset(size.width / 2 + x * scale, size.height / 2 + y * scale);
}

Vec3 _fibonacciPoint(int index, int count, double radius) {
  final y = 1 - 2 * ((index + .5) / math.max(1, count));
  final ring = math.sqrt(math.max(0, 1 - y * y));
  final theta = index * math.pi * (3 - math.sqrt(5));
  return Vec3(math.cos(theta) * ring * radius, y * radius,
      math.sin(theta) * ring * radius);
}

Vec3 _childPoint(Vec3 parent, int index, int count, double radius) {
  final theta = index * math.pi * (3 - math.sqrt(5));
  final y = (index - (count - 1) / 2) * radius * .44;
  return Vec3(parent.x + math.cos(theta) * radius, parent.y + y,
      parent.z + math.sin(theta) * radius);
}
