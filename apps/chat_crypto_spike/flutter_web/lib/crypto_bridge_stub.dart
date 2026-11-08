Future<String> runCryptoRoundtripFromWasm() {
  throw UnsupportedError('Matrix WASM bridge is available only in a Web browser.');
}

Future<Map<String, String>> openAndroidCryptoStore(String passphrase) {
  throw UnsupportedError('Native crypto store is available only in the Android probe.');
}

Future<void> closeAndroidCryptoStore() {
  throw UnsupportedError('Native crypto store is available only in the Android probe.');
}
