import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import '../model/graph_scene.dart';
import '../model/workspace_data.dart';

class GraphView extends StatefulWidget {
  const GraphView({required this.data, required this.scene, super.key});
  final WorkspaceData data;
  final GraphScene scene;
  @override
  State<GraphView> createState() => _GraphViewState();
}

class _GraphViewState extends State<GraphView> {
  double yaw = -.48, pitch = .22, zoom = 1;
  String? selected;
  final enabledEdges = <String>{
    'runtime-hard',
    'build-hard',
    'build-orchestration',
    'external-hard',
    'external-runtime',
    'system-detail'
  };
  @override
  Widget build(BuildContext context) => Card(
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            GestureDetector(
              onPanUpdate: (d) => setState(() {
                yaw += d.delta.dx * .008;
                pitch = (pitch + d.delta.dy * .006).clamp(-1.2, 1.2);
              }),
              onTapUp: (d) => setState(() =>
                  selected = _hit(d.localPosition, context.size ?? Size.zero)),
              child: Listener(
                onPointerSignal: (event) {
                  if (event is PointerScrollEvent) {
                    setState(
                      () => zoom =
                          (zoom * math.exp(-event.scrollDelta.dy * .001))
                              .clamp(.45, 2.6),
                    );
                  }
                },
                child: CustomPaint(
                  painter: _GraphPainter(
                    widget.scene,
                    yaw: yaw,
                    pitch: pitch,
                    zoom: zoom,
                    selected: selected,
                    enabledEdges: enabledEdges,
                  ),
                  child: const SizedBox.expand(),
                ),
              ),
            ),
            const Positioned(left: 14, top: 12, child: _Hint()),
            if (selected != null)
              Positioned(
                right: 14,
                top: 12,
                width: 240,
                child: Card(
                  color: Colors.black.withValues(alpha: .78),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: _Details(
                        data: widget.data,
                        node: widget.scene.nodes
                            .firstWhere((node) => node.id == selected)),
                  ),
                ),
              ),
            Positioned(
                left: 14,
                bottom: 12,
                child: _Legend(
                    enabled: enabledEdges,
                    onToggle: (key) => setState(() {
                          if (enabledEdges.contains(key)) {
                            enabledEdges.remove(key);
                          } else {
                            enabledEdges.add(key);
                          }
                        }))),
            Positioned(
                right: 14,
                bottom: 12,
                child: OutlinedButton.icon(
                    onPressed: () => setState(() {
                          yaw = -.48;
                          pitch = .22;
                          zoom = 1;
                          selected = null;
                        }),
                    icon: const Icon(Icons.refresh, size: 16),
                    label: const Text('重設視角'))),
          ],
        ),
      );
  String? _hit(Offset point, Size size) {
    String? hit;
    var distance = 30.0;
    for (final node in widget.scene.nodes) {
      final next = (projectPoint(
                node.position,
                size,
                yaw: yaw,
                pitch: pitch,
                zoom: zoom,
              ) -
              point)
          .distance;
      if (next < distance) {
        hit = node.id;
        distance = next;
      }
    }
    return hit;
  }
}

class _Hint extends StatelessWidget {
  const _Hint();
  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: .6),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Padding(
          padding: EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          child: Text(
            '3D VIEW  •  拖曳旋轉  •  滾輪縮放  •  點節點查看系統',
            style: TextStyle(color: Colors.white, fontSize: 12),
          ),
        ),
      );
}

class _Details extends StatelessWidget {
  const _Details({required this.data, required this.node});
  final WorkspaceData data;
  final GraphNode node;
  @override
  Widget build(BuildContext context) {
    final relationships = data.relationships
        .where((edge) =>
            edge.from == node.repository.id || edge.to == node.repository.id)
        .toList();
    final contracts = data.contracts
        .where((contract) =>
            contract.owners.contains(node.repository.id) ||
            contract.consumers.contains(node.repository.id))
        .toList();
    return ConstrainedBox(
      constraints: const BoxConstraints(maxHeight: 420),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(node.label,
              style: const TextStyle(
                  color: Colors.white, fontWeight: FontWeight.bold)),
          const SizedBox(height: 5),
          Text('${node.repository.kind}  •  v${node.repository.version}',
              style: const TextStyle(color: Color(0xff9ec5e8), fontSize: 12)),
          const SizedBox(height: 8),
          Text(node.details,
              style: const TextStyle(color: Colors.white, fontSize: 12)),
          const SizedBox(height: 8),
          Text(
              '${node.isChild ? '子系統' : '系統'}  •  連線 ${node.degree}  •  負責契約 ${node.contractCount}',
              style: const TextStyle(color: Color(0xffc5d8eb), fontSize: 12)),
          const SizedBox(height: 5),
          Text(node.repository.repository,
              style: const TextStyle(color: Color(0xff7dd3fc), fontSize: 10)),
          ...[
            const SizedBox(height: 10),
            const _SectionTitle('關聯資料'),
            Text(
                '此節點所屬系統包含 ${relationships.length} 條關係與 ${contracts.length} 個 contracts。',
                style: const TextStyle(color: Color(0xffb8cbe0), fontSize: 11)),
            const SizedBox(height: 8),
            const _SectionTitle('Relationships'),
            ...relationships.map((edge) => Padding(
                padding: const EdgeInsets.only(bottom: 5),
                child: Text(
                    '${edge.from} → ${edge.to}\n${edge.classification} • ${edge.protocol}',
                    style: const TextStyle(
                        color: Color(0xffd7e5f3), fontSize: 11)))),
            const SizedBox(height: 6),
            const _SectionTitle('Contracts'),
            ...contracts.map((contract) => Padding(
                padding: const EdgeInsets.only(bottom: 5),
                child: Text(
                    '${contract.id}\n${contract.invariants.join(' • ')}',
                    style: const TextStyle(
                        color: Color(0xffd7e5f3), fontSize: 11)))),
          ],
        ]),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Text(text,
          style: const TextStyle(
              color: Color(0xff7dd3fc),
              fontWeight: FontWeight.bold,
              fontSize: 11)));
}

class _Legend extends StatelessWidget {
  const _Legend({required this.enabled, required this.onToggle});
  final Set<String> enabled;
  final ValueChanged<String> onToggle;
  @override
  Widget build(BuildContext context) => Wrap(spacing: 4, children: [
        for (final key in const [
          'runtime-hard',
          'build-hard',
          'build-orchestration',
          'external-hard',
          'external-runtime',
          'system-detail'
        ])
          FilterChip(
              label: Text(key, style: const TextStyle(fontSize: 10)),
              selected: enabled.contains(key),
              onSelected: (_) => onToggle(key))
      ]);
}

class _GraphPainter extends CustomPainter {
  _GraphPainter(
    this.scene, {
    required this.yaw,
    required this.pitch,
    required this.zoom,
    required this.selected,
    required this.enabledEdges,
  });
  final GraphScene scene;
  final double yaw, pitch, zoom;
  final String? selected;
  final Set<String> enabledEdges;
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = const Color(0xff06111e),
    );
    final positions = {
      for (final node in scene.nodes)
        node.id: projectPoint(
          node.position,
          size,
          yaw: yaw,
          pitch: pitch,
          zoom: zoom,
        ),
    };
    for (final relation in scene.edges) {
      final a = positions[relation.from], b = positions[relation.to];
      if (a != null &&
          b != null &&
          enabledEdges.contains(relation.classification)) {
        final color = _edgeColor(relation.classification);
        final line = Paint()
          ..color = color.withValues(
              alpha: relation.from == selected || relation.to == selected
                  ? .95
                  : .42)
          ..strokeWidth =
              relation.from == selected || relation.to == selected ? 3 : 1.5;
        canvas.drawLine(a, b, line);
        _arrow(canvas, a, b, line);
        _edgeLabel(canvas, relation.label,
            Offset((a.dx + b.dx) / 2, (a.dy + b.dy) / 2), color);
      }
    }
    for (final node in scene.nodes) {
      final p = positions[node.id]!;
      final active = node.id == selected;
      final color = node.isChild
          ? const Color(0xff34d399)
          : node.repository.kind == 'frontend'
              ? const Color(0xff22d3ee)
              : node.repository.kind == 'backend'
                  ? const Color(0xff60a5fa)
                  : const Color(0xffa78bfa);
      final double radius = node.isChild
          ? 6
          : 8.0 + math.min(8.0, node.degree.toDouble()).toDouble();
      canvas.drawCircle(
        p,
        active ? radius + 10 : radius + 5,
        Paint()..color = color.withValues(alpha: .18),
      );
      canvas.drawCircle(
          p, active ? radius : radius - 2, Paint()..color = color);
      final label = TextPainter(
        text: TextSpan(
          text: node.label,
          style: const TextStyle(color: Color(0xffdbeafe), fontSize: 12),
        ),
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: 180);
      label.paint(canvas, p + Offset(radius + 7, -8));
    }
  }

  Color _edgeColor(String type) => type == 'runtime-hard'
      ? const Color(0xff38bdf8)
      : type == 'system-detail'
          ? const Color(0xff34d399)
          : type == 'build-hard'
              ? const Color(0xffa78bfa)
              : type == 'external-hard'
                  ? const Color(0xfffb7185)
                  : const Color(0xfffbbf24);
  void _arrow(Canvas canvas, Offset from, Offset to, Paint paint) {
    final d = to - from;
    if (d.distance < 1) return;
    final u = d / d.distance;
    final tip = to - u * 16;
    final left = tip - Offset(-u.dy * 5, u.dx * 5);
    final right = tip - Offset(u.dy * 5, -u.dx * 5);
    canvas.drawLine(left, tip, paint);
    canvas.drawLine(right, tip, paint);
  }

  void _edgeLabel(Canvas canvas, String text, Offset center, Color color) {
    final painter = TextPainter(
        text: TextSpan(text: text, style: TextStyle(color: color, fontSize: 9)),
        textDirection: TextDirection.ltr)
      ..layout();
    painter.paint(canvas, center + const Offset(4, -13));
  }

  @override
  bool shouldRepaint(covariant _GraphPainter old) =>
      yaw != old.yaw ||
      pitch != old.pitch ||
      zoom != old.zoom ||
      selected != old.selected ||
      enabledEdges != old.enabledEdges ||
      scene != old.scene;
}
