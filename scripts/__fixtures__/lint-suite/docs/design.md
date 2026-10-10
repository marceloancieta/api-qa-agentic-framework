# Fixture: a case design with real-looking values and reserved look-alikes

## Values that must be reported

- Contact: jane.doe@mailhub.co  <!-- expect-finding: email-address -->
- Upstream: https://api.payments-corp.io/v2/charges  <!-- expect-finding: host-name -->
- Mirror: www.shopfront.net  <!-- expect-finding: host-name -->
- Gateway: 10.20.30.40 and 8.8.4.4  <!-- expect-finding: ip-address -->
- Support line: +49 30 1234 5678  <!-- expect-finding: phone-number -->
- US desk: (415) 867-5309  <!-- expect-finding: phone-number -->
- Session: `eyJhIjoxfQ.eyJzIjoxfQ.c2lnbmF0dXJl`  <!-- expect-finding: jwt -->
- Account: 3f2c9a1e-7b4d-4c2a-9e8f-1a2b3c4d5e6f  <!-- expect-finding: uuid -->
- Billing reference 204857193746  <!-- expect-finding: numeric-id -->
- Probes covered: `p-8007238027`, `p-4699623064` (generated probe names, all-decimal hex)
- Not a probe id, so still an identifier: ref-8007238027  <!-- expect-finding: numeric-id -->
- Credentials in a URL: https://svc:pw@build.internal.io/x  <!-- expect-finding: email-address -->
- Internal API at http://172.16.4.12:8080/v3  <!-- expect-finding: ip-address -->

## Reserved or placeholder values that must stay quiet

- Contact: buyer@example.com, ops@qa.example.org, someone@shop.test
- Base URLs: https://petstore.example/api/v3, http://localhost:8080/api/v3, http://api.invalid
- Container service: http://petstore:8080/api/v3
- Documentation addresses: 192.0.2.10, 198.51.100.7, 203.0.113.250, 127.0.0.1, 0.0.0.0
- Fictional phones: +1 202 555 0143, (212) 555-0187, 312-555-0100
- Nil id: 00000000-0000-0000-0000-000000000000
- Placeholders: `<EMAIL>`, `user@<domain>`, `https://{host}/v3`, `${BASE_URL}/pet/<petId>`
- Ordinary content: version 1.2.3, Node 22.20.5, date 2026-10-09, commit `7167972`, 3.14159265,
  line 120, amount 1,000,000, probe:p-658044b361, ratio 12345678
