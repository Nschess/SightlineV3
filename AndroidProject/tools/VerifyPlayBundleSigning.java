import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.jar.JarFile;
import java.io.OutputStream;

class VerifyPlayBundleSigning {
    public static void main(String[] args) throws Exception {
        var expected = HexFormat.of().parseHex(args[1]);
        try (var bundle = new JarFile(args[0], true)) {
            var entries = bundle.entries();
            int verified = 0;
            while (entries.hasMoreElements()) {
                var entry = entries.nextElement();
                if (entry.isDirectory() || entry.getName().matches(
                        "(?i)META-INF/(MANIFEST\\.MF|[^/]+\\.(SF|RSA|DSA|EC)|SIG-[^/]+)")) {
                    continue;
                }
                try (var stream = bundle.getInputStream(entry)) {
                    stream.transferTo(OutputStream.nullOutputStream());
                }
                var signers = entry.getCodeSigners();
                if (signers == null || signers.length != 1) {
                    throw new SecurityException("Expected one verified AAB signer for " + entry.getName());
                }
                var certificate = signers[0].getSignerCertPath().getCertificates().get(0);
                var actual = MessageDigest.getInstance("SHA-256").digest(certificate.getEncoded());
                if (!MessageDigest.isEqual(actual, expected)) {
                    throw new SecurityException("AAB signer does not match the registered upload certificate for " + entry.getName());
                }
                verified++;
            }
            if (verified == 0) {
                throw new SecurityException("AAB has no signed payload");
            }
        }
    }
}
