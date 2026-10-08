import json, pathlib, zipfile, os, uuid
base = pathlib.Path(__file__).resolve().parent.parent
test = base / 'tests' / 'desktop'
run_id = uuid.uuid4().hex[:12]
profile = test / ('profile-' + run_id)
data_dir = test / ('data-' + run_id)
(profile / 'extensions').mkdir(parents=True, exist_ok=True)
data_dir.mkdir(exist_ok=True)
prefs = {
    'extensions.zotero.dataDir': str(data_dir),
    'extensions.zotero.useDataDir': True,
    'extensions.zotero.firstRun2': False,
    'extensions.autoDisableScopes': 0,
    'extensions.enabledScopes': 15,
    'extensions.zotero.sync.autoSync': False,
    'extensions.zotero.automaticScraperUpdates': False,
    'app.update.auto': False,
}
(profile / 'user.js').write_text('\n'.join(f'user_pref({json.dumps(k)}, {json.dumps(v)});' for k,v in prefs.items()), encoding='utf-8')
manifest = json.loads((base / 'manifest.json').read_text(encoding='utf-8'))
manifest['name'] = 'Tag Studio isolated test harness'
manifest['applications']['zotero']['id'] = 'tagstudio-test@local.tools'
with zipfile.ZipFile(profile / 'extensions' / 'tagstudio-test@local.tools.xpi', 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('manifest.json', json.dumps(manifest))
    harness = (base / 'tests' / 'desktop-bootstrap.js').read_text(encoding='utf-8')
    harness = harness.replace("'__TAGSTUDIO_TEST_BASE__'", json.dumps(str(base) + os.sep))
    harness = harness.replace('__TAGSTUDIO_TEST_VERSION__', manifest['version'])
    archive.writestr('bootstrap.js', harness)
print(profile)
# A one-page PDF fixture, generated locally without accessing user attachments.
objects = [b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
content=b'BT /F1 16 Tf 40 430 Td (Tag Studio reader integration test) Tj ET'
objects.append(b'<< /Length '+str(len(content)).encode()+b' >>\nstream\n'+content+b'\nendstream')
pdf=b'%PDF-1.4\n'; offsets=[0]
for i,obj in enumerate(objects,1):
    offsets.append(len(pdf));pdf+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
start=len(pdf)
pdf+=b'xref\n0 6\n0000000000 65535 f \n'+b''.join(f'{offset:010d} 00000 n \n'.encode() for offset in offsets[1:])
pdf+=b'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+str(start).encode()+b'\n%%EOF\n'
(test / 'sample.pdf').write_bytes(pdf)
