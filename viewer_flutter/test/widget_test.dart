import 'package:flutter_test/flutter_test.dart';
import 'package:taiwan_brawl_workspace_viewer/main.dart';

void main() {
  testWidgets('app bootstraps', (tester) async {
    await tester.pumpWidget(const WorkspaceApp());
    expect(find.text('TaiwanBrawlWorkspace'), findsOneWidget);
  });
}
