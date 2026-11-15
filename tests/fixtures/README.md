# TLS test fixture only

TEST-ONLY-do-not-deploy-cert.pem and TEST-ONLY-do-not-deploy-key.pem are copied only for deterministic in-memory configuration tests. The certificate is self-signed for sightline.test, a reserved test hostname that the release hostname policy rejects.

The tests never bind a socket, install a certificate, alter an operating-system trust store, or use this key to start a release host. Never deploy these fixture files.
