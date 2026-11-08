import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_web/main.dart';

void main() {
  testWidgets('Android crypto probe exposes the persistent store controls', (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    try {
      await tester.pumpWidget(const CryptoSpikeApp());

      expect(find.text('Android 原生加密小樣'), findsOneWidget);
      expect(find.text('本機測試密碼（至少 12 字元）'), findsOneWidget);
      expect(find.text('開啟／重開資料庫'), findsOneWidget);
      expect(find.text('關閉資料庫'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'too-short');
      await tester.tap(find.text('開啟／重開資料庫'));
      await tester.pump();
      expect(find.text('測試密碼至少需要 12 個字元。'), findsOneWidget);
    } finally {
      debugDefaultTargetPlatformOverride = null;
    }
  });
}
