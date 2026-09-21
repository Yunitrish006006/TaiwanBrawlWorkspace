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
      this.depth = 0,
      this.parentId});
  final String id, label, kind, details;
  final RepositoryData repository;
  final Vec3 position;
  final int degree, contractCount;
  final int depth;
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
        details: _rootDetails(repo),
        repository: repo,
        position: rootPosition,
        degree: degree,
        contractCount: contracts);
    roots.add(root);
    nodes.add(root);
    _addFeatureNodes(
        repo: repo,
        parentId: repo.id,
        parentPosition: rootPosition,
        specs: _featuresFor(repo),
        prefix: repo.id,
        depth: 1,
        nodes: nodes,
        edges: edges);
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

class _FeatureSpec {
  const _FeatureSpec(this.label, this.details, [this.children = const []]);
  final String label, details;
  final List<_FeatureSpec> children;
}

void _addFeatureNodes({
  required RepositoryData repo,
  required String parentId,
  required Vec3 parentPosition,
  required List<_FeatureSpec> specs,
  required String prefix,
  required int depth,
  required List<GraphNode> nodes,
  required List<GraphEdge> edges,
}) {
  for (var index = 0; index < specs.length; index++) {
    final spec = specs[index];
    final id = '$prefix:$index';
    final position =
        _childPoint(parentPosition, index, specs.length, depth == 1 ? 96 : 62);
    nodes.add(GraphNode(
        id: id,
        label: spec.label,
        kind: depth == 1 ? 'subsystem' : 'explanation',
        details: spec.details,
        repository: repo,
        position: position,
        degree: 0,
        contractCount: 0,
        depth: depth,
        parentId: parentId));
    edges.add(GraphEdge(
        id: 'detail:$id',
        from: parentId,
        to: id,
        label: depth == 1 ? '管理元件' : '說明',
        classification: 'system-detail'));
    if (spec.children.isNotEmpty) {
      _addFeatureNodes(
          repo: repo,
          parentId: id,
          parentPosition: position,
          specs: spec.children,
          prefix: id,
          depth: depth + 1,
          nodes: nodes,
          edges: edges);
    }
  }
}

String _rootDetails(RepositoryData repo) => repo.id == 'user-ui-settings'
    ? 'Flutter 共用 UI 設定套件。將它加入 pubspec，於 MaterialApp 上層注入設定狀態，再把 theme、locale、font-scale 映射到 MaterialApp 的 themeMode、locale 與文字縮放；各頁面只讀取狀態，不自行保存設定。'
    : repo.role;

List<_FeatureSpec> _featuresFor(RepositoryData repo) {
  if (repo.id == 'user-ui-settings') {
    return [
      _FeatureSpec(
          'Theme 管理元件',
          '集中管理 themeMode 與 ThemeData。Flutter 根元件讀取這個狀態後傳給 MaterialApp，頁面不直接修改全域主題。',
          [
            _FeatureSpec('Theme：跟隨系統',
                '使用 ThemeMode.system。裝置切換亮暗色時，MaterialApp 依平台設定更新；適合預設值。'),
            _FeatureSpec('Theme：亮色模式',
                '使用 ThemeMode.light，固定套用亮色 ThemeData；適合白天或需要固定對比的介面。'),
            _FeatureSpec('Theme：暗色模式',
                '使用 ThemeMode.dark，固定套用暗色 ThemeData；適合夜間使用並降低畫面亮度。'),
            _FeatureSpec('Theme 設定保存',
                '把 system、light、dark 的選擇寫入偏好資料，啟動時先讀取，再建立 MaterialApp，避免畫面短暫閃回預設主題。')
          ]),
      _FeatureSpec(
          'Locale 管理元件',
          '集中管理目前語系、支援語系列表與 fallback。MaterialApp.locale 只接收這裡的狀態，翻譯資源由 Flutter localizations delegate 提供。',
          [
            _FeatureSpec('Locale：選擇語系',
                '在設定頁更新 locale，例如 zh-TW 或 en-US；更新後通知 MaterialApp 重建，所有使用 localizations 的文字同步切換。'),
            _FeatureSpec('Locale：預設與 fallback',
                '啟動時優先使用已保存語系，沒有保存值時採裝置語系；不支援的語系回退到套件定義的預設語系，避免顯示空白文字。'),
            _FeatureSpec('Locale：保存與同步',
                '語系選擇寫入使用者偏好，下一次啟動還原；登入使用者可再與帳號偏好同步，但本地值仍要能離線使用。')
          ]),
      _FeatureSpec('Scale 管理元件',
          '集中管理文字縮放倍率，將狀態提供給 Flutter 的文字排版層；頁面不各自設定字體大小，確保整個應用程式一致。', [
        _FeatureSpec('Scale：倍率設定',
            '設定字體倍率，例如 0.85、1.0、1.15 或 1.3；MaterialApp 下的文字依同一倍率放大或縮小。'),
        _FeatureSpec('Scale：可讀性與邊界',
            '提供有限的最小與最大值，避免文字溢出；設定頁要即時預覽，讓使用者確認按鈕、對話框與聊天內容仍可讀。'),
        _FeatureSpec('Scale：保存偏好', '把倍率保存到偏好資料，啟動時先還原；若資料損壞或超出範圍，回到 1.0 的安全值。')
      ]),
      _FeatureSpec('Flutter 專案接入流程',
          '在 pubspec.yaml 引用 user_ui_settings，於 runApp 的根部建立設定 provider，將 provider 暴露給 MaterialApp 與設定頁；資料層負責讀寫偏好，呈現層只消費狀態。')
    ];
  }
  if (repo.id == 'user-basic-system') {
    return [
      _FeatureSpec('Profile System', '使用者基本資料與 profile abstraction'),
      _FeatureSpec('Direct Message Model', 'DM 對話、訊息與收件匣資料模型'),
      _FeatureSpec('Reusable Chat Abstraction', '提供前端可重用的聊天介面與狀態')
    ];
  }
  if (repo.id == 'taiwan-brawl-front') {
    return [
      _FeatureSpec('Flutter UX', '頁面、導航、主題整合與互動介面'),
      _FeatureSpec('Social & Chat', '好友、私訊、通知與社交體驗'),
      _FeatureSpec('Royale UI', '大逃殺 lobby、戰鬥畫面與牌組介面'),
      _FeatureSpec('FCM Client', '註冊裝置 token 並接收推播'),
      _FeatureSpec('Web Session Client', 'Cookie / Bearer session 與 API client')
    ];
  }
  if (repo.id == 'taiwan-brawl-back') {
    return [
      _FeatureSpec('API & Sessions', 'HTTP API、登入 session 與使用者資料'),
      _FeatureSpec('D1 Persistence', '資料表、查詢與持久化狀態'),
      _FeatureSpec('KV Assets', 'Flutter Web 靜態資產與版本化檔案'),
      _FeatureSpec('Royale Room', 'ROYALE_ROOM Durable Object 即時房間狀態'),
      _FeatureSpec('FCM Delivery', '後端推播發送與通知佇列'),
      _FeatureSpec('Integrated Deploy', '建置 frontend、上傳 KV 並部署 Worker')
    ];
  }
  return [_FeatureSpec('Core Responsibilities', repo.role)];
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
