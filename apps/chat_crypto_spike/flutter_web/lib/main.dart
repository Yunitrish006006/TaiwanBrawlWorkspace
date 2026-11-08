import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'crypto_bridge.dart';

void main() => runApp(const CryptoSpikeApp());

class CryptoSpikeApp extends StatelessWidget {
  const CryptoSpikeApp({super.key});

  @override
  Widget build(BuildContext context) {
    const forest = Color(0xFF101715);
    return MaterialApp(
      title: 'Flutter E2EE Bridge Spike',
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: forest,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFA5D0B2),
          brightness: Brightness.dark,
        ),
      ),
      home: const RoundtripPage(),
    );
  }
}

class RoundtripPage extends StatefulWidget {
  const RoundtripPage({super.key});

  @override
  State<RoundtripPage> createState() => _RoundtripPageState();
}

class _RoundtripPageState extends State<RoundtripPage> {
  final _passphraseController = TextEditingController();
  String _status = 'Flutter 尚未呼叫加密橋接。';
  bool _running = false;
  bool? _passed;
  bool _nativeStoreOpen = false;

  bool get _isAndroidProbe =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  Future<void> _runRoundtrip() async {
    setState(() {
      _running = true;
      _passed = null;
      _status = '正在從 Dart 呼叫 Matrix WASM，建立兩個虛構裝置…';
    });
    try {
      final result = await runCryptoRoundtripFromWasm();
      if (!mounted) return;
      setState(() {
        _running = false;
        _passed = true;
        _status = 'Flutter ↔ WASM 呼叫成功\n$result';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _running = false;
        _passed = false;
        _status = '橋接失敗：$error';
      });
    }
  }

  Future<void> _openNativeStore() async {
    if (_passphraseController.text.length < 12) {
      setState(() {
        _passed = false;
        _status = '測試密碼至少需要 12 個字元。';
      });
      return;
    }
    setState(() {
      _running = true;
      _passed = null;
      _status = '正在 Android 原生端開啟本機加密資料庫…';
    });
    try {
      final result = await openAndroidCryptoStore(_passphraseController.text);
      if (!mounted) return;
      setState(() {
        _running = false;
        _nativeStoreOpen = true;
        _passed = true;
        _status = '原生加密資料庫已開啟\n裝置：${result['deviceId']}\n'
            '身分指紋：${result['fingerprint']}\n'
            '關閉資料庫後用同一密碼重開，指紋應維持一致。';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _running = false;
        _nativeStoreOpen = false;
        _passed = false;
        _status = '資料庫未能開啟（錯誤密碼應在此被拒絕）：$error';
      });
    }
  }

  Future<void> _closeNativeStore() async {
    setState(() {
      _running = true;
      _status = '正在關閉本機加密資料庫…';
    });
    try {
      await closeAndroidCryptoStore();
      if (!mounted) return;
      setState(() {
        _running = false;
        _nativeStoreOpen = false;
        _passed = true;
        _status = '資料庫已關閉。請用同一密碼重開比對指紋，再試錯誤密碼。';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _running = false;
        _passed = false;
        _status = '關閉失敗：$error';
      });
    }
  }

  @override
  void dispose() {
    _passphraseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final resultColor = switch (_passed) {
      true => const Color(0xFF183224),
      false => const Color(0xFF2D1918),
      null => const Color(0xFF151E1A),
    };
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'TAIWAN BRAWL · CHAT',
                  style: TextStyle(letterSpacing: 2, color: Color(0xFF8CB5A1)),
                ),
                const SizedBox(height: 12),
                Text(
                  _isAndroidProbe ? 'Android 原生加密小樣' : 'Flutter Web 加密橋接小樣',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 8),
                Text(_isAndroidProbe
                    ? '以虛構裝置開啟本機加密資料庫，檢查裝置身分能否持久保存。'
                    : '從 Dart 呼叫官方 Matrix Rust WASM，驗證兩個虛構裝置互相加密與解密。'),
                const SizedBox(height: 20),
                Card(
                  color: const Color(0xFF242112),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(_isAndroidProbe
                        ? '隔離測試：只使用虛構身分與 App 私有資料夾，不連正式帳號、relay 或聊天資料。'
                        : '隔離測試：不連正式伺服器、不使用玩家帳號或聊天資料。'),
                  ),
                ),
                const SizedBox(height: 20),
                if (_isAndroidProbe) ...[
                  TextField(
                    controller: _passphraseController,
                    obscureText: true,
                    autocorrect: false,
                    enableSuggestions: false,
                    decoration: const InputDecoration(
                      labelText: '本機測試密碼（至少 12 字元）',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 12,
                    runSpacing: 8,
                    children: [
                      FilledButton.icon(
                        onPressed: _running || _nativeStoreOpen ? null : _openNativeStore,
                        icon: const Icon(Icons.lock_open),
                        label: const Text('開啟／重開資料庫'),
                      ),
                      OutlinedButton.icon(
                        onPressed: _running || !_nativeStoreOpen ? null : _closeNativeStore,
                        icon: const Icon(Icons.lock),
                        label: const Text('關閉資料庫'),
                      ),
                    ],
                  ),
                ] else
                  FilledButton.icon(
                    onPressed: _running ? null : _runRoundtrip,
                    icon: _running
                        ? const SizedBox.square(
                            dimension: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.lock_outline),
                    label: const Text('從 Flutter 執行雙裝置加密測試'),
                  ),
                const SizedBox(height: 16),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: resultColor,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: SelectableText(_status),
                ),
                const SizedBox(height: 16),
                Text(
                  _isAndroidProbe
                      ? '這只驗證 Android 原生 store 建立、正確密碼重開與錯誤密碼拒絕；不代表正式 E2EE 或自有 relay 相容性已驗收。'
                      : '此結果只驗證 Flutter Web ↔ WASM 的呼叫與瀏覽器端加解密；不代表自有 relay、iOS 或 Android 已驗收。',
                  style: const TextStyle(color: Color(0xFFAAB9B1), fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
