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

String _rootDetails(RepositoryData repo) {
  if (repo.id == 'user-ui-settings') {
    return 'Flutter 共用 UI 設定套件。將它加入 pubspec，於 MaterialApp 上層注入設定狀態，再把 theme、locale、font-scale 映射到 MaterialApp 的 themeMode、locale 與文字縮放；各頁面只讀取狀態，不自行保存設定。';
  }
  if (repo.id == 'user-basic-system') {
    return 'Flutter 共用使用者與聊天抽象層。前端以 package dependency 引入，讓 profile、DM 與聊天狀態有一致的資料模型；API client 負責傳輸，呈現層只消費這些模型。';
  }
  if (repo.id == 'taiwan-brawl-front') {
    return 'Taiwan Brawl Flutter 前端。它組合共用 UI、使用者系統與後端 API，負責頁面、登入 session、社交聊天、Royale 對戰與 FCM client；資料取得和畫面呈現分開，資料更新不需要重寫 3D viewer。';
  }
  if (repo.id == 'taiwan-brawl-back') {
    return 'Taiwan Brawl Cloudflare Workers 後端。它提供 API、session、D1/KV 持久化、Royale Durable Object 與 FCM delivery，並負責建置 frontend、發布 Flutter Web 靜態資產與整合部署。';
  }
  return repo.role;
}

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
      _FeatureSpec('Profile 管理元件',
          '提供跨頁面共用的使用者身份、顯示名稱、頭像與基本狀態模型。前端頁面讀取同一份 profile，避免每頁重複定義欄位。', [
        _FeatureSpec('Profile 資料欄位',
            '保存使用者識別、顯示名稱、頭像與可公開資訊；敏感 session 應由前端 session client 管理，不放入展示用 profile。'),
        _FeatureSpec('Profile 載入流程',
            '登入後由 API client 取得 profile，轉成共用模型，再提供給個人頁、好友列表與聊天頁；載入中與失敗狀態要能被 UI 明確呈現。'),
        _FeatureSpec('Profile 更新邊界',
            '編輯資料先由表單驗證，再交給 API 寫入；更新成功後刷新共用狀態，其他頁面只接收狀態變更，不自行維護副本。')
      ]),
      _FeatureSpec(
          'Direct Message 管理元件',
          '定義 DM 對話、訊息、收件匣與已讀狀態的資料模型；傳輸方式由前端 API client 與後端 pending_messages contract 負責。',
          [
            _FeatureSpec('Conversation 資料',
                '以對話 ID、參與者、最後訊息與未讀數描述收件匣；列表排序使用後端時間或游標，不依賴本地陣列順序。'),
            _FeatureSpec('Message 資料',
                '每筆訊息包含訊息 ID、發送者、內容、建立時間與投遞狀態；訊息 ID 用來去重，避免輪詢更新時重複插入。'),
            _FeatureSpec('Polling 與已讀',
                '目前 DM 是 polling-first，通知不是訊息真實來源；畫面讀取 pending_messages 後更新模型，已讀狀態再透過明確 API 寫回。')
          ]),
      _FeatureSpec('Reusable Chat 管理元件',
          '提供可重用的聊天狀態與 UI 邊界，讓私訊、好友或其他對話場景共用訊息列表、輸入框與載入狀態。', [
        _FeatureSpec('聊天狀態',
            '統一管理 initial、loading、ready、sending、empty 與 error 狀態；頁面只根據狀態繪製，不直接操作資料來源。'),
        _FeatureSpec('訊息發送',
            '輸入內容先做空白與長度檢查，再交給 API；送出中鎖定重複操作，成功後以 server message 為準更新列表。'),
        _FeatureSpec('前端接入方式',
            'taiwan_brawl_front 只需提供 conversation ID、資料 client 與回呼，即可重用聊天呈現；後端 contract 變更集中在 adapter。')
      ])
    ];
  }
  if (repo.id == 'taiwan-brawl-front') {
    return [
      _FeatureSpec('Flutter UX 管理元件',
          '負責頁面、路由、MaterialApp 組裝、user_ui_settings 整合與互動介面；呈現層不直接保存後端資料。', [
        _FeatureSpec('App 根組裝',
            '在 runApp 根部注入 UI settings 與 user basic system，再建立 MaterialApp；theme、locale、scale 由共用狀態驅動。'),
        _FeatureSpec('路由與頁面狀態',
            '路由只傳遞必要的 ID 或參數，頁面啟動後由資料層載入內容；切換頁面不應複製整份 workspace 或使用者資料。'),
        _FeatureSpec('資料與呈現分離',
            'repository、controller 或 service 負責資料取得與轉換，Widget 只接收狀態並繪製；因此資料更新不需要整個網站重新編譯。')
      ]),
      _FeatureSpec('Social & Chat 管理元件',
          '組合 user_basic_system 的 profile、DM 與聊天抽象，呈現好友、私訊、收件匣與通知體驗。', [
        _FeatureSpec('好友與 profile',
            '好友列表使用共用 profile 模型，顯示名稱與頭像由單一資料來源提供；點擊好友只傳遞對方 ID 到下一頁。'),
        _FeatureSpec(
            'DM 收件匣', '以對話摘要、最後訊息與未讀數呈現收件匣；資料透過 polling 更新，推播只負責提醒使用者回到 app。'),
        _FeatureSpec('聊天畫面', '重用聊天狀態元件，處理載入、發送、錯誤與空狀態；訊息成功與否以後端回應為準。')
      ]),
      _FeatureSpec(
          'Royale UI 管理元件',
          '負責大逃殺 lobby、房間、戰鬥畫面與牌組介面；即時房間真實狀態由後端 ROYALE_ROOM Durable Object 擁有。',
          [
            _FeatureSpec('Lobby 與房間',
                'Lobby 顯示可加入的房間與玩家摘要；進入房間後以 room ID 建立資料訂閱，不把房間狀態寫死在頁面。'),
            _FeatureSpec('戰鬥與牌組',
                '戰鬥 UI 只呈現 server state 與玩家操作結果；牌組選擇先做本地驗證，再送出 command，避免畫面自行推進不可逆狀態。'),
            _FeatureSpec('即時狀態邊界',
                '前端可重連並重新取得房間快照；斷線時顯示連線狀態，恢復後以 server snapshot 校正本地畫面。')
          ]),
      _FeatureSpec(
          '遊戲玩法',
          '與 Flutter UX、Social & Chat、Royale UI 同一層的產品玩法節點。它描述玩家從進入 lobby、組牌、加入房間、進行回合到完成結算的完整循環；畫面只是呈現玩法狀態，規則與結果由 server contract 驗證。',
          [
            _FeatureSpec('進入與配對',
                '玩家先完成登入，再從 lobby 選擇玩法或加入房間；前端傳送玩家與玩法參數，後端確認資格、房間容量與目前階段。'),
            _FeatureSpec(
                '牌組與出戰準備', '玩家在開戰前選擇合法牌組與角色設定；前端做即時提示，送出時仍由後端驗證牌組版本、資源與規則。'),
            _FeatureSpec('回合與玩家操作',
                '每回合由 server state 決定可用操作、順序與結果；client 傳送 command，收到結果後更新動畫、血量、資源與回合倒數。'),
            _FeatureSpec(
                '勝負與結算', '達成勝利、淘汰或時間結束條件後，由房間狀態產生唯一結算；前端顯示結果與獎勵，不能自行計算或重複發放。'),
            _FeatureSpec('斷線與重新加入',
                '斷線時保留房間 ID 與連線狀態，重新連線後先取得 snapshot，再恢復到正確回合；不要用本地暫存狀態覆蓋 server truth。'),
            _FeatureSpec('玩法與資料分離',
                '玩法規則、房間狀態與玩家資料由後端與共用模型提供，Flutter Widget 只負責呈現；規則更新時可更新資料與 contract，不必重做整個 viewer。')
          ]),
      _FeatureSpec(
          'FCM Client 管理元件', '註冊裝置 token、處理前景與背景通知，通知只作為提醒通道，不取代後端持久化資料。', [
        _FeatureSpec('Token 註冊',
            '登入且取得通知權限後取得 FCM token，送到後端並與使用者或裝置關聯；token 更新時要重新同步。'),
        _FeatureSpec('通知點擊',
            '點擊 DM 或房間通知時只帶 resource ID，開啟 app 後由資料層重新讀取最新內容，不直接相信通知 payload 是完整資料。'),
        _FeatureSpec('權限與失敗', '拒絕通知權限不能阻止登入與聊天；註冊失敗要可重試，並在登出時解除不再使用的 token。')
      ]),
      _FeatureSpec(
          'Web Session Client 管理元件',
          '統一處理 Web cookie session 與非 Web Bearer session，並將 API 呼叫、錯誤與重新登入行為集中管理。',
          [
            _FeatureSpec('Session 建立',
                '登入成功後保存 session reference；Web 使用 cookie，非 Web client 使用 Bearer session_id，頁面不直接組 Authorization header。'),
            _FeatureSpec('API adapter',
                '將 HTTP response 轉成共用資料模型與明確錯誤；資料層只依賴 adapter，不讓 Widget 耦合 endpoint 格式。'),
            _FeatureSpec('過期與登出',
                '遇到 session 過期時清除本地狀態並回到登入流程；登出同時撤銷本地 session 與通知註冊關聯。')
          ])
    ];
  }
  if (repo.id == 'taiwan-brawl-back') {
    return [
      _FeatureSpec(
          'API & Sessions 管理元件',
          '提供 HTTP API、登入、session 與使用者資料；它是 frontend 的資料入口，負責驗證輸入與回傳穩定 contract。',
          [
            _FeatureSpec('API route 邊界',
                '每個 route 只負責驗證 request、呼叫 domain service、整理 response；不要讓 Flutter UI 依賴 D1 欄位或內部表名。'),
            _FeatureSpec('Cookie 與 Bearer',
                'Web client 可使用 cookie session，非 Web client 使用 Bearer session_id；兩者最後都解析成同一個 authenticated user context。'),
            _FeatureSpec('錯誤與權限',
                '未登入、無權限、輸入錯誤與資源不存在要使用可辨識的 status 與 error code，讓前端能分別顯示與處理。')
          ]),
      _FeatureSpec('D1 Persistence 管理元件',
          '負責使用者、聊天、房間索引與其他持久化資料；schema 與 query 是後端內部實作，對外只暴露 contract。', [
        _FeatureSpec('資料表與 migration',
            'schema 變更要以 migration 管理，新增欄位先保持向後相容；部署前確認 production D1 已完成 migration。'),
        _FeatureSpec('查詢與索引',
            '依 route 的讀取模式建立索引，聊天列表使用時間與 conversation ID 分頁；避免把整張表載入 Worker 記憶體。'),
        _FeatureSpec('DM 真實來源',
            'pending_messages 與訊息資料由 D1 持久化；FCM 只是通知通道，不能當作訊息遺失後的唯一來源。')
      ]),
      _FeatureSpec('KV Assets 管理元件',
          '保存 Flutter Web 靜態資產與版本化檔案，讓 Worker 可以回傳前端 build 結果。', [
        _FeatureSpec('Asset 發布',
            'frontend build 產生的 index、JS、CSS 與字型依路徑寫入 KV；每次發布保留可辨識版本，避免新舊資產混用。'),
        _FeatureSpec('Cache 與 fallback',
            '靜態檔案可使用 cache header，但 index 要能導向目前版本；缺少 asset 時回傳明確 404，不要靜默回傳 API JSON。'),
        _FeatureSpec('前端資料更新',
            'workspace viewer 的 JSON 資料與 UI 程式分離時，可只更新資料 asset，再由 Web runtime 重新讀取，不必重新編譯呈現層。')
      ]),
      _FeatureSpec('Royale Room 管理元件',
          '由 ROYALE_ROOM Durable Object 擁有單一房間的即時狀態、玩家操作順序與房間生命週期。', [
        _FeatureSpec('房間狀態所有權',
            '同一 room ID 的請求路由到同一個 Durable Object；Worker 不在多個請求間自行拼接即時狀態。'),
        _FeatureSpec('Command 與 snapshot',
            'client 傳送可驗證 command，Durable Object 更新狀態後回傳結果或 snapshot；前端以 server state 校正本地畫面。'),
        _FeatureSpec(
            '重連與清理', '玩家重連時先取得目前 snapshot；房間結束或玩家離開時清理連線與暫存狀態，持久化結果另寫入 D1。')
      ]),
      _FeatureSpec('FCM Delivery 管理元件',
          '後端負責將 DM 或房間事件轉成 FCM notification，通知使用者回到 app 讀取真正資料。', [
        _FeatureSpec('通知 payload',
            'payload 只帶事件種類與 resource ID，不放完整訊息內容；client 點擊後重新呼叫 API 取得最新資料。'),
        _FeatureSpec(
            '投遞與失敗', 'FCM 回應成功才記錄投遞結果；失效 token 要標記或移除，暫時性錯誤可依既有佇列策略重試。'),
        _FeatureSpec('與 DM 的關係',
            'FCM 不保存訊息，也不取代 pending_messages polling；即使通知遺失，使用者仍可從收件匣讀到持久化訊息。')
      ]),
      _FeatureSpec('Integrated Deploy 管理元件',
          '把 frontend build、KV assets、Worker routes 與環境設定組成一次可驗證的部署流程。', [
        _FeatureSpec('Build 順序',
            '先安裝並建置 Flutter frontend，再產生靜態資產與 manifest，最後上傳 KV 並部署 Worker，避免 Worker 指向不存在的檔案。'),
        _FeatureSpec('環境與 secrets',
            'D1、KV、Durable Object binding 與 FCM credentials 由部署環境注入；repository 不保存 token、服務帳密或私人 endpoint。'),
        _FeatureSpec('部署驗證',
            '部署後檢查 API health、登入 session、靜態首頁、KV asset 與 room route；只有實際 runtime 回應成功才算完成。')
      ])
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
