// =====================================================
// CONFIGURAÇÃO DO SUPABASE
// =====================================================
const SUPABASE_URL = 'https://rvonmtplyjbmyzdktber.supabase.co';

const SUPABASE_ANON_KEY = 'sb_publishable_1Z0J0De4bZvM7FOZpiNvww_WWI8PUV6';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const statusEl = document.getElementById('status');
function setStatus(message){
  if(statusEl) statusEl.textContent = message;
}

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, s => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  })[s]);
}

function normalizeDecimal(value){
  return String(value ?? '').trim().replace(',', '.');
}

function getCurrentDateTimeLocal(){
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

async function preencherMunicipioPorCoordenada(lat, lon){
  try{
    setStatus('Identificando município pela coordenada...');

    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`;

    const resp = await fetch(url, { headers:{ 'Accept':'application/json' } });

    if(!resp.ok) throw new Error('Falha na geocodificação reversa');

    const data = await resp.json();
    const addr = data.address || {};

    const municipio =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.county ||
      '';

    const uf = addr.state_code || addr.state || '';
    const pais = addr.country || 'Brasil';

    if(municipio) document.querySelector('[name="municipio"]').value = municipio;
    if(uf) document.querySelector('[name="uf"]').value = uf;
    if(pais) document.querySelector('[name="pais"]').value = pais;

    setStatus('Município identificado automaticamente.');

  }catch(err){
    console.warn('Não foi possível identificar município automaticamente.', err);
    setStatus('Coordenada capturada. Município não identificado automaticamente.');
  }
}

let map;
let markers;
let cachedRecords = [];

let tempMarker = null;


function getFormationColor(formacao){
  const f = String(formacao || '').toLowerCase();

  if(f.includes('furnas')) return '#1976d2';
  if(f.includes('ponta grossa')) return '#d32f2f';
  if(f.includes('são domingos') || f.includes('sao domingos')) return '#388e3c';

  const custom = (typeof customFormations !== 'undefined' ? customFormations : [])
    .find(item => f.includes(String(item.name || '').toLowerCase()));

  if(custom && custom.color) return custom.color;

  return '#616161';
}

function createColoredMarker(lat, lon, formacao){
  const color = getFormationColor(formacao);

  return L.circleMarker([lat, lon], {
    radius:8,
    fillColor:color,
    color:'#ffffff',
    weight:2,
    opacity:1,
    fillOpacity:0.9
  });
}


function setCoordinates(lat, lon){
  document.getElementById('latitude').value = Number(lat).toFixed(6);
  document.getElementById('longitude').value = Number(lon).toFixed(6);

  const dataColeta = document.getElementById('data_coleta');
  if(dataColeta && !dataColeta.value){
    dataColeta.value = getCurrentDateTimeLocal();
  }
}

function updateTemporaryMarker(lat, lon){
  if(tempMarker){
    tempMarker.setLatLng([lat, lon]);
  }else{
    tempMarker = L.marker([lat, lon], {
      draggable:true
    }).addTo(map);

    tempMarker.bindPopup('Ponto temporário').openPopup();

    tempMarker.on('dragend', e => {
      const pos = e.target.getLatLng();
      setCoordinates(pos.lat, pos.lng);
    });
  }

  setCoordinates(lat, lon);
}



function initMap(){
  const mapEl = document.getElementById('map');

  if(!mapEl){
    console.error('Elemento #map não encontrado.');
    return;
  }

  mapEl.style.height = 'calc(100vh - 66px)';
  mapEl.style.width = '100%';

  const INITIAL_LAT = -14.2350;
  const INITIAL_LNG = -51.9253;

  map = L.map('map', {
    zoomControl: true
  }).setView([INITIAL_LAT, INITIAL_LNG], 4);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  markers = L.layerGroup().addTo(map);

  map.on('click', e => {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    updateTemporaryMarker(lat, lon);
    document.getElementById('precisao_gps').value = '';
    document.getElementById('data_coleta').value = getCurrentDateTimeLocal();
    preencherMunicipioPorCoordenada(lat, lon);
    setStatus('Coordenadas preenchidas pelo clique no mapa.');
  });

  setTimeout(() => map.invalidateSize(), 200);
  setTimeout(() => map.invalidateSize(), 800);
  window.addEventListener('resize', () => map.invalidateSize());

  loadAfloramentos();
}

function buildPopup(r){
  let fotos = [];

  try{
    if(Array.isArray(r.fotos_urls)){
      fotos = r.fotos_urls;
    }else if(typeof r.fotos_urls === 'string'){
      fotos = JSON.parse(r.fotos_urls);
    }
  }catch(e){
    console.warn('Erro ao ler galeria de fotos');
  }

  if((!fotos || fotos.length === 0) && r.foto_url){
    fotos = [r.foto_url];
  }

  let fotosFosseis = [];

  try{
    if(Array.isArray(r.fosseis_fotos_urls)){
      fotosFosseis = r.fosseis_fotos_urls;
    }else if(typeof r.fosseis_fotos_urls === 'string'){
      fotosFosseis = JSON.parse(r.fosseis_fotos_urls);
    }
  }catch(e){
    console.warn('Erro ao ler fotos dos fósseis');
  }

  const gallery = fotos.length > 0
    ? `<div class="popup-gallery">` +
      fotos.map(f =>
        `<a href="${escapeHtml(f)}" target="_blank">
          <img src="${escapeHtml(f)}" alt="Foto do afloramento">
        </a>`
      ).join('') +
      `</div>`
    : '';

  const fossilGallery = fotosFosseis.length > 0
    ? `<p><strong>Fotos dos fósseis:</strong></p><div class="popup-gallery">` +
      fotosFosseis.map(f =>
        `<a href="${escapeHtml(f)}" target="_blank">
          <img src="${escapeHtml(f)}" alt="Foto de fóssil">
        </a>`
      ).join('') +
      `</div>`
    : '';

  return `
    <div class="popup-item">
      ${gallery}
      <h3>${escapeHtml(r.nome)}</h3>
      <p><strong>Município:</strong> ${escapeHtml(r.municipio ?? '')} / ${escapeHtml(r.uf ?? '')}</p>
      <p><strong>País:</strong> ${escapeHtml(r.pais ?? 'Brasil')}</p>
      <p><strong>Precisão GPS:</strong> ${escapeHtml(r.precisao_gps ?? '')} m</p>
      <p><strong>Data/hora:</strong> ${escapeHtml(r.data_coleta ?? '')}</p>
      <p><strong>Coordenadas:</strong> ${escapeHtml(r.latitude)}, ${escapeHtml(r.longitude)}</p>
      <p><strong>Altitude:</strong> ${escapeHtml(r.altitude ?? '')} m</p>
      <p><strong>Formação:</strong> ${escapeHtml(r.formacao_geologica ?? '')}</p>
      <p><strong>Idade:</strong> ${escapeHtml(r.idade_geologica ?? '')}</p>
      <p><strong>Fósseis:</strong> ${escapeHtml(r.fosseis_encontrados ?? '')}</p>
      <p><strong>Detalhes dos fósseis:</strong> ${escapeHtml(r.fosseis_detalhes ?? '')}</p>
      ${fossilGallery}
      <p><strong>Conservação:</strong> ${escapeHtml(r.estado_conservacao ?? '')}</p>
      <p><strong>Vulnerabilidade:</strong> ${escapeHtml(r.vulnerabilidade ?? '')}</p>
      <p><strong>Potencial educativo:</strong> ${escapeHtml(r.potencial_educativo ?? '')}</p>
      <p>${escapeHtml(r.descricao ?? '')}</p>

      <div class="popup-actions popup-actions-route">
        <button class="btn-route" onclick="goToAfloramento(${r.latitude}, ${r.longitude})">🧭 Chegar</button>
      </div>

      <div class="popup-actions">
        <button class="btn-edit" onclick="editAfloramento(${r.id})">Editar</button>
        <button class="btn-delete" onclick="deleteAfloramento(${r.id})">Excluir</button>
      </div>
    </div>`;
}




window.goToAfloramento = function(lat, lon){
  const latitude = Number(lat);
  const longitude = Number(lon);

  if(!Number.isFinite(latitude) || !Number.isFinite(longitude)){
    alert('Coordenadas inválidas para rota.');
    return;
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  let url;

  if(isIOS){
    url = `https://maps.apple.com/?daddr=${latitude},${longitude}&dirflg=d`;
  }else{
    url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
  }

  window.open(url, '_blank');
}

function fillForm(record){
  document.getElementById('editing-id').value = record.id;

  document.querySelector('[name="nome"]').value = record.nome || '';
  document.querySelector('[name="municipio"]').value = record.municipio || '';
  document.querySelector('[name="uf"]').value = record.uf || '';
  document.querySelector('[name="pais"]').value = record.pais || 'Brasil';
  document.querySelector('[name="latitude"]').value = record.latitude || '';
  document.querySelector('[name="longitude"]').value = record.longitude || '';
  document.querySelector('[name="altitude"]').value = record.altitude || '';
  document.querySelector('[name="precisao_gps"]').value = record.precisao_gps || '';
  document.querySelector('[name="data_coleta"]').value = record.data_coleta || '';
  document.querySelector('[name="formacao_geologica"]').value = record.formacao_geologica || '';
  document.querySelector('[name="idade_geologica"]').value = record.idade_geologica || '';
  document.querySelector('[name="fosseis_encontrados"]').value = record.fosseis_encontrados || '';
  document.querySelector('[name="fosseis_encontrados"]').dataset.manual = record.fosseis_encontrados || '';
  document.querySelector('[name="fosseis_detalhes"]').value = record.fosseis_detalhes || '';
  document.querySelector('[name="descricao"]').value = record.descricao || '';
  document.querySelector('[name="estado_conservacao"]').value = record.estado_conservacao || 'Bom';
  document.querySelector('[name="vulnerabilidade"]').value = record.vulnerabilidade || 'Baixa';
  document.querySelector('[name="potencial_educativo"]').value = record.potencial_educativo || 'Baixo';
  document.querySelector('[name="observacoes"]').value = record.observacoes || '';

  document.getElementById('cancel-edit').style.display = 'block';

  updateTemporaryMarker(record.latitude, record.longitude);

  window.scrollTo({
    top:0,
    behavior:'smooth'
  });

  setStatus('Editando afloramento #' + record.id);
}

window.editAfloramento = function(id){
  const record = cachedRecords.find(r => Number(r.id) === Number(id));

  if(!record){
    alert('Registro não encontrado.');
    return;
  }

  fillForm(record);
}

window.deleteAfloramento = async function(id){
  const confirmar = confirm('Deseja realmente excluir este afloramento?');

  if(!confirmar) return;

  try{
    const { error } = await db
      .from('afloramentos')
      .delete()
      .eq('id', id);

    if(error) throw error;

    await loadAfloramentos();

    alert('Afloramento excluído com sucesso.');

  }catch(err){
    console.error(err);
    alert('Erro ao excluir afloramento.');
  }
}


async function loadAfloramentos(){
  if(!markers) return;

  try{
    setStatus('Carregando afloramentos...');
    const { data, error } = await db
      .from('afloramentos')
      .select('*')
      .order('created_at', { ascending: false });

    if(error) throw error;

    cachedRecords = data || [];
    markers.clearLayers();

    cachedRecords.forEach(r => {
      const lat = Number(r.latitude);
      const lon = Number(r.longitude);
      if(Number.isFinite(lat) && Number.isFinite(lon)){
        const filtro = document.getElementById('formation-filter')?.value || 'all';
        const formacao = String(r.formacao_geologica || '').toLowerCase();

        if(
          filtro === 'all' ||
          formacao.includes(filtro)
        ){
          createColoredMarker(lat, lon, r.formacao_geologica)
            .addTo(markers)
            .bindPopup(buildPopup(r));
        }
      }
    });

    setStatus(`${cachedRecords.length} afloramento(s) carregado(s).`);
  }catch(err){
    console.error(err);
    setStatus('Mapa aberto. Erro ao carregar banco: verifique tabela/chave Supabase.');
  }
}

document.getElementById('use-location').addEventListener('click', () => {
  if(!navigator.geolocation){
    alert('Geolocalização não disponível neste navegador.');
    return;
  }

  setStatus('Buscando localização pelo GPS...');
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const alt = pos.coords.altitude;
    const acc = pos.coords.accuracy;

    document.getElementById('latitude').value = lat.toFixed(6);
    document.getElementById('longitude').value = lon.toFixed(6);

    if(alt !== null && Number.isFinite(alt)){
      document.getElementById('altitude').value = alt.toFixed(1);
    }

    if(acc !== null && Number.isFinite(acc)){
      document.getElementById('precisao_gps').value = acc.toFixed(1);
    }

    document.getElementById('data_coleta').value = getCurrentDateTimeLocal();

    if(map){
      map.setView([lat, lon], 16);
      updateTemporaryMarker(lat, lon);
      map.invalidateSize();
    }

    preencherMunicipioPorCoordenada(lat, lon);

    setStatus('Ponto atual capturado automaticamente. Confira os dados antes de salvar.');
  }, err => {
    console.error(err);
    alert('Não foi possível obter a localização: ' + err.message);
    setStatus('GPS não autorizado ou indisponível.');
  }, { enableHighAccuracy:true, timeout:15000, maximumAge:0 });
});

async function uploadFoto(file){
  if (!file) return null;

  const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `${Date.now()}-${safeName}`;

  const { error } = await db.storage
    .from('fotos-afloramentos')
    .upload(fileName, file);

  if (error) {
    console.error(error);
    return null;
  }

  const { data } = db.storage
    .from('fotos-afloramentos')
    .getPublicUrl(fileName);

  return data.publicUrl;
}


async function uploadListaFotos(inputId, label){
  const files = Array.from(document.getElementById(inputId)?.files || []);
  const urls = [];

  for(const file of files){
    const tiposPermitidos = ['image/jpeg', 'image/png'];
    const extensaoPermitida = /\.(jpg|jpeg|png)$/i.test(file.name);

    if(!tiposPermitidos.includes(file.type) && !extensaoPermitida){
      alert(`Formato inválido em ${label}. Use apenas JPG, JPEG ou PNG.`);
      return null;
    }

    if(file.size > 10000000){
      alert(`Uma das fotos em ${label} ultrapassa 10 MB.`);
      return null;
    }

    setStatus(`Enviando ${label}: foto ${urls.length + 1} de ${files.length}...`);

    const url = await uploadFoto(file);

    if(url){
      urls.push(url);
    }
  }

  return urls;
}

document.getElementById('afloramento-form').addEventListener('submit', async e => {
  e.preventDefault();

  const form = e.target;
  const fd = new FormData(form);

  const lat = Number(normalizeDecimal(fd.get('latitude')));
  const lon = Number(normalizeDecimal(fd.get('longitude')));
  const altitudeRaw = normalizeDecimal(fd.get('altitude'));

  if(!Number.isFinite(lat) || !Number.isFinite(lon)){
    alert('Latitude e longitude precisam ser números válidos.');
    return;
  }

  const record = {
    nome: fd.get('nome')?.trim(),
    municipio: fd.get('municipio')?.trim(),
    uf: fd.get('uf')?.trim(),
    pais: fd.get('pais')?.trim() || 'Brasil',
    latitude: lat,
    longitude: lon,
    altitude: altitudeRaw === '' ? null : Number(altitudeRaw),
    precisao_gps: normalizeDecimal(fd.get('precisao_gps')) === '' ? null : Number(normalizeDecimal(fd.get('precisao_gps'))),
    data_coleta: fd.get('data_coleta')?.trim(),
    formacao_geologica: fd.get('formacao_geologica')?.trim(),
    idade_geologica: fd.get('idade_geologica')?.trim(),
    fosseis_encontrados: fd.get('fosseis_encontrados')?.trim(),
    fosseis_detalhes: fd.get('fosseis_detalhes')?.trim(),
    descricao: fd.get('descricao')?.trim(),
    estado_conservacao: fd.get('estado_conservacao'),
    vulnerabilidade: fd.get('vulnerabilidade'),
    potencial_educativo: fd.get('potencial_educativo'),
    observacoes: fd.get('observacoes')?.trim(),
    foto_url: null
  };

  const fotosUrls = await uploadListaFotos('foto', 'fotos do afloramento');
  if(fotosUrls === null) return;

  if(fotosUrls.length > 0){
    record.foto_url = fotosUrls[0];
    record.fotos_urls = fotosUrls;
  }

  const fotosFosseisUrls = await uploadListaFotos('fotos_fosseis', 'fotos dos fósseis');
  if(fotosFosseisUrls === null) return;

  if(fotosFosseisUrls.length > 0){
    record.fosseis_fotos_urls = fotosFosseisUrls;
  }

  try{
    setStatus('Salvando afloramento...');
    const editingId = document.getElementById('editing-id').value;

    let error;

    if(editingId){
      const response = await db
        .from('afloramentos')
        .update(record)
        .eq('id', editingId);

      error = response.error;

    }else{
      const response = await db
        .from('afloramentos')
        .insert([record]);

      error = response.error;
    }

    if(error) throw error;

    form.reset();

    document.getElementById('editing-id').value = '';
    document.getElementById('cancel-edit').style.display = 'none';

    document.querySelector('input[name="municipio"]').value = '';
    document.querySelector('input[name="pais"]').value = 'Brasil';

    if(tempMarker){
      map.removeLayer(tempMarker);
      tempMarker = null;
    }
    await loadAfloramentos();
    alert('Afloramento salvo com sucesso.');
  }catch(err){
    console.error(err);
    alert('Erro ao salvar. Verifique se a tabela afloramentos foi criada com o SQL correto.');
    setStatus('Erro ao salvar.');
  }
});

async function getAllRows(){
  const { data, error } = await db
    .from('afloramentos')
    .select('*')
    .order('created_at', { ascending:false });

  if(error) throw error;
  return data || [];
}


const exportToggle = document.getElementById('export-toggle');
if(exportToggle){
  exportToggle.addEventListener('click', () => {
    document.getElementById('export-options').classList.toggle('open');
  });
}

document.addEventListener('click', e => {
  const menu = document.querySelector('.export-menu');
  const options = document.getElementById('export-options');

  if(menu && options && !menu.contains(e.target)){
    options.classList.remove('open');
  }
});

function closeExportMenu(){
  const options = document.getElementById('export-options');
  if(options) options.classList.remove('open');
}

function getFotosArray(r){
  try{
    if(Array.isArray(r.fotos_urls)) return r.fotos_urls;
    if(typeof r.fotos_urls === 'string') return JSON.parse(r.fotos_urls);
  }catch(e){}
  return r.foto_url ? [r.foto_url] : [];
}

function getFosseisFotosArray(r){
  try{
    if(Array.isArray(r.fosseis_fotos_urls)) return r.fosseis_fotos_urls;
    if(typeof r.fosseis_fotos_urls === 'string') return JSON.parse(r.fosseis_fotos_urls);
  }catch(e){}
  return [];
}

function downloadFile(content, filename, mime){
  const blob = new Blob([content], { type:mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById('export-csv').addEventListener('click', async () => {
  closeExportMenu();
  try{
    const rows = await getAllRows();
    const header = ['id','nome','municipio','uf','pais','latitude','longitude','altitude','precisao_gps','data_coleta','formacao_geologica','idade_geologica','fosseis_encontrados','fosseis_detalhes','descricao','estado_conservacao','vulnerabilidade','potencial_educativo','observacoes','foto_url','fotos_urls','fosseis_fotos_urls','created_at'];
    const csv = [header.join(',')]
      .concat(rows.map(r => header.map(h => `"${String(r[h] ?? '').replace(/"/g,'""')}"`).join(',')))
      .join('\n');

    downloadFile(csv, 'afloramentos.csv', 'text/csv;charset=utf-8');
  }catch(err){
    console.error(err);
    alert('Erro ao exportar CSV.');
  }
});

document.getElementById('export-geojson').addEventListener('click', async () => {
  closeExportMenu();
  try{
    const rows = await getAllRows();
    const features = rows.map(r => {
      const lat = Number(r.latitude);
      const lon = Number(r.longitude);
      if(!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

      return {
        type:'Feature',
        geometry:{ type:'Point', coordinates:[lon, lat] },
        properties:{
          id:r.id,
          nome:r.nome,
          municipio:r.municipio,
          uf:r.uf,
          pais:r.pais,
          altitude:r.altitude,
          precisao_gps:r.precisao_gps,
          data_coleta:r.data_coleta,
          formacao_geologica:r.formacao_geologica,
          idade_geologica:r.idade_geologica,
          fosseis_encontrados:r.fosseis_encontrados,
          fosseis_detalhes:r.fosseis_detalhes,
          descricao:r.descricao,
          estado_conservacao:r.estado_conservacao,
          vulnerabilidade:r.vulnerabilidade,
          potencial_educativo:r.potencial_educativo,
          observacoes:r.observacoes,
          foto_url:r.foto_url,
          fotos_urls:r.fotos_urls,
          fosseis_fotos_urls:r.fosseis_fotos_urls,
          created_at:r.created_at
        }
      };
    }).filter(Boolean);

    downloadFile(JSON.stringify({ type:'FeatureCollection', features }, null, 2), 'afloramentos.geojson', 'application/geo+json');
  }catch(err){
    console.error(err);
    alert('Erro ao exportar GeoJSON.');
  }
});


document.getElementById('export-excel').addEventListener('click', async () => {
  closeExportMenu();

  try{
    const rows = await getAllRows();

    const tabelaDados = rows.map(r => `
      <tr>
        <td>${escapeHtml(r.id)}</td>
        <td>${escapeHtml(r.nome)}</td>
        <td>${escapeHtml(r.municipio)}</td>
        <td>${escapeHtml(r.uf)}</td>
        <td>${escapeHtml(r.pais || 'Brasil')}</td>
        <td>${escapeHtml(r.latitude)}</td>
        <td>${escapeHtml(r.longitude)}</td>
        <td>${escapeHtml(r.altitude)}</td>
        <td>${escapeHtml(r.precisao_gps)}</td>
        <td>${escapeHtml(r.data_coleta)}</td>
        <td>${escapeHtml(r.formacao_geologica)}</td>
        <td>${escapeHtml(r.idade_geologica)}</td>
        <td>${escapeHtml(r.estado_conservacao)}</td>
        <td>${escapeHtml(r.vulnerabilidade)}</td>
        <td>${escapeHtml(r.potencial_educativo)}</td>
        <td>${escapeHtml(r.fosseis_encontrados)}</td>
        <td>${escapeHtml(r.fosseis_detalhes)}</td>
        <td>${escapeHtml(r.descricao)}</td>
        <td>${escapeHtml(r.observacoes)}</td>
        <td>${r.foto_url ? `<a href="${escapeHtml(r.foto_url)}">foto principal</a>` : ''}</td>
      </tr>
    `).join('');

    const catalogoVisual = rows.map(r => {
      const fotos = getFotosArray(r);
      const primeiraFoto = fotos[0] || '';

      return `
        <tr>
          <td>${primeiraFoto ? `<img src="${escapeHtml(primeiraFoto)}" width="160">` : ''}</td>
          <td>
            <strong>${escapeHtml(r.nome)}</strong><br>
            Município: ${escapeHtml(r.municipio)} / ${escapeHtml(r.uf)}<br>
            Formação: ${escapeHtml(r.formacao_geologica)}<br>
            Vulnerabilidade: ${escapeHtml(r.vulnerabilidade)}<br>
            Potencial educativo: ${escapeHtml(r.potencial_educativo)}<br>
            Coordenadas: ${escapeHtml(r.latitude)}, ${escapeHtml(r.longitude)}
          </td>
          <td>${escapeHtml(r.descricao)}</td>
        </tr>
      `;
    }).join('');

    const resumoFormacoes = {};
    rows.forEach(r => {
      const f = r.formacao_geologica || 'Não informado';
      resumoFormacoes[f] = (resumoFormacoes[f] || 0) + 1;
    });

    const resumoHtml = Object.entries(resumoFormacoes).map(([f, qtd]) => `
      <tr>
        <td>${escapeHtml(f)}</td>
        <td>${qtd}</td>
      </tr>
    `).join('');

    const html = `
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body{font-family:Arial,sans-serif;}
          table{border-collapse:collapse;width:100%;}
          th,td{border:1px solid #999;padding:6px;vertical-align:top;}
          th{background:#e8f3f2;}
          img{border-radius:6px;}
          h1,h2{color:#205f5d;}
        </style>
      </head>
      <body>
        <h1>Inventário Paleontológico - Exportação Visual</h1>

        <h2>Dados completos</h2>
        <table>
          <tr>
            <th>ID</th><th>Nome</th><th>Município</th><th>UF</th><th>País</th>
            <th>Latitude</th><th>Longitude</th><th>Altitude</th><th>Precisão GPS</th><th>Data coleta</th>
            <th>Formação</th><th>Idade</th><th>Conservação</th><th>Vulnerabilidade</th><th>Potencial</th>
            <th>Fósseis</th><th>Detalhes fósseis</th><th>Descrição</th><th>Observações</th><th>Foto</th>
          </tr>
          ${tabelaDados}
        </table>

        <h2>Catálogo visual</h2>
        <table>
          <tr><th>Foto</th><th>Identificação</th><th>Descrição</th></tr>
          ${catalogoVisual}
        </table>

        <h2>Síntese por formação</h2>
        <table>
          <tr><th>Formação</th><th>Quantidade</th></tr>
          ${resumoHtml}
        </table>
      </body>
      </html>
    `;

    downloadFile(html, 'inventario_paleontologico_visual.xls', 'application/vnd.ms-excel;charset=utf-8');

  }catch(err){
    console.error(err);
    alert('Erro ao exportar Excel visual.');
  }
});

document.getElementById('export-kml').addEventListener('click', async () => {
  closeExportMenu();

  try{
    const rows = await getAllRows();

    const placemarks = rows.map(r => {
      const lat = Number(r.latitude);
      const lon = Number(r.longitude);

      if(!Number.isFinite(lat) || !Number.isFinite(lon)) return '';

      const descricao = `
        <![CDATA[
          <strong>${escapeHtml(r.nome)}</strong><br>
          Município: ${escapeHtml(r.municipio)} / ${escapeHtml(r.uf)}<br>
          Formação: ${escapeHtml(r.formacao_geologica)}<br>
          Idade: ${escapeHtml(r.idade_geologica)}<br>
          Conservação: ${escapeHtml(r.estado_conservacao)}<br>
          Vulnerabilidade: ${escapeHtml(r.vulnerabilidade)}<br>
          Potencial educativo: ${escapeHtml(r.potencial_educativo)}<br>
          Fósseis: ${escapeHtml(r.fosseis_encontrados)}<br>
          ${r.foto_url ? `<img src="${escapeHtml(r.foto_url)}" width="250">` : ''}
        ]]>
      `;

      return `
        <Placemark>
          <name>${escapeHtml(r.nome || 'Afloramento')}</name>
          <description>${descricao}</description>
          <Point>
            <coordinates>${lon},${lat},0</coordinates>
          </Point>
        </Placemark>
      `;
    }).join('');

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
      <kml xmlns="http://www.opengis.net/kml/2.2">
        <Document>
          <name>Inventário Paleontológico</name>
          ${placemarks}
        </Document>
      </kml>`;

    downloadFile(kml, 'afloramentos_google_earth.kml', 'application/vnd.google-earth.kml+xml');

  }catch(err){
    console.error(err);
    alert('Erro ao exportar KML.');
  }
});

document.getElementById('export-backup').addEventListener('click', async () => {
  closeExportMenu();

  try{
    const rows = await getAllRows();

    const backup = {
      sistema:'Inventário Paleontológico e Geoconservação',
      exportado_em:new Date().toISOString(),
      total_registros:rows.length,
      dados:rows
    };

    downloadFile(JSON.stringify(backup, null, 2), 'backup_inventario_paleontologico.json', 'application/json;charset=utf-8');

  }catch(err){
    console.error(err);
    alert('Erro ao exportar backup.');
  }
});



document.getElementById('export-pdf').addEventListener('click', async () => {
  closeExportMenu();
  try{
    const rows = await getAllRows();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    rows.forEach((r, idx) => {
      if(idx > 0) doc.addPage();

      let y = 14;
      doc.setFontSize(14);
      doc.text(String(r.nome || 'Afloramento sem nome'), 12, y);
      y += 8;

      doc.setFontSize(10);
      const linhas = [
        `Município: ${r.municipio || ''}`,
        `Coordenadas: ${r.latitude || ''}, ${r.longitude || ''}`,
        `Altitude: ${r.altitude || ''} m`,
        `Formação: ${r.formacao_geologica || ''}`,
        `Idade: ${r.idade_geologica || ''}`,
        `Fósseis: ${r.fosseis_encontrados || ''}`,
        `Estado de conservação: ${r.estado_conservacao || ''}`,
        `Vulnerabilidade: ${r.vulnerabilidade || ''}`,
        `Potencial educativo: ${r.potencial_educativo || ''}`,
        `Descrição: ${r.descricao || ''}`,
        `Observações: ${r.observacoes || ''}`
      ];

      linhas.forEach(l => {
        const split = doc.splitTextToSize(l, 180);
        doc.text(split, 12, y);
        y += split.length * 5 + 2;
      });
    });

    doc.save('afloramentos.pdf');
  }catch(err){
    console.error(err);
    alert('Erro ao exportar PDF.');
  }
});

window.addEventListener('load', initMap);


document.getElementById('clear-point').addEventListener('click', () => {
  if(tempMarker){
    map.removeLayer(tempMarker);
    tempMarker = null;
  }

  document.getElementById('latitude').value = '';
  document.getElementById('longitude').value = '';
  document.getElementById('precisao_gps').value = '';
  document.getElementById('data_coleta').value = '';

  setStatus('Ponto temporário removido.');
});


document.addEventListener('DOMContentLoaded', () => {
  const filter = document.getElementById('formation-filter');

  if(filter){
    filter.addEventListener('change', () => {
      loadAfloramentos();
    });
  }
});


document.getElementById('cancel-edit').addEventListener('click', () => {

  document.getElementById('editing-id').value = '';
  document.getElementById('afloramento-form').reset();

  document.querySelector('input[name="municipio"]').value = '';
    document.querySelector('input[name="pais"]').value = 'Brasil';

  document.getElementById('cancel-edit').style.display = 'none';

  if(tempMarker){
    map.removeLayer(tempMarker);
    tempMarker = null;
  }

  setStatus('Edição cancelada.');
});


const customFormations = JSON.parse(localStorage.getItem('customFormations') || '[]');

function renderCustomFormations(){
  const list = document.getElementById('custom-formations-list');

  if(!list) return;

  list.innerHTML = '';

  customFormations.forEach(f => {

    const item = document.createElement('div');
    item.className = 'legend-item';

    item.innerHTML = `
      <span class="legend-color" style="background:${f.color}"></span>
      ${f.name}
    `;

    list.appendChild(item);

    const filter = document.getElementById('formation-filter');

    const exists = Array.from(filter.options).some(o => o.value === f.name.toLowerCase());

    if(!exists){
      const opt = document.createElement('option');
      opt.value = f.name.toLowerCase();
      opt.textContent = f.name;
      filter.appendChild(opt);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {

  renderCustomFormations();

  const btn = document.getElementById('add-formation-btn');

  if(btn){
    btn.addEventListener('click', () => {

      const nameInput = document.getElementById('new-formation-name');
      const colorInput = document.getElementById('new-formation-color');

      const name = nameInput.value.trim();
      const color = colorInput.value;

      if(!name){
        alert('Informe o nome da formação.');
        return;
      }

      customFormations.push({
        name,
        color
      });

      localStorage.setItem('customFormations', JSON.stringify(customFormations));

      renderCustomFormations();
      updateFormationDatalist();

      nameInput.value = '';

      alert('Nova formação adicionada à legenda e às sugestões do formulário.');
    });
  }
});


// =====================================================
// SUGESTÕES DE FORMAÇÃO + BIBLIOTECA FOSSILÍFERA
// =====================================================
const fossilLibraryDevonianoPR = [
  { nome:'Braquiópodes', grupo:'Brachiopoda' },
  { nome:'Lingulida', grupo:'Brachiopoda' },
  { nome:'Orbiculoidea', grupo:'Brachiopoda' },
  { nome:'Australospirifer', grupo:'Brachiopoda' },
  { nome:'Australocoelia', grupo:'Brachiopoda' },
  { nome:'Schuchertella', grupo:'Brachiopoda' },
  { nome:'Derbyina', grupo:'Brachiopoda' },
  { nome:'Bivalves', grupo:'Mollusca' },
  { nome:'Tentaculites', grupo:'Tentaculitoidea' },
  { nome:'Trilobitas', grupo:'Arthropoda' },
  { nome:'Calmonia', grupo:'Trilobita' },
  { nome:'Homalonotus', grupo:'Trilobita' },
  { nome:'Dalmanites', grupo:'Trilobita' },
  { nome:'Conularia', grupo:'Cnidaria / Conulata' },
  { nome:'Crinoides', grupo:'Echinodermata' },
  { nome:'Ostracodes', grupo:'Arthropoda' },
  { nome:'Gastrópodes', grupo:'Mollusca' },
  { nome:'Hyolithes', grupo:'Hyolitha' },
  { nome:'Icnofósseis', grupo:'Traços fósseis' },
  { nome:'Skolithos', grupo:'Icnofóssil' },
  { nome:'Planolites', grupo:'Icnofóssil' },
  { nome:'Cruziana', grupo:'Icnofóssil' },
  { nome:'Rusophycus', grupo:'Icnofóssil' },
  { nome:'Moldes externos', grupo:'Tipo de preservação' },
  { nome:'Moldes internos', grupo:'Tipo de preservação' },
  { nome:'Fragmentos fossilíferos indeterminados', grupo:'Indeterminado' }
];

function normalizeTextForSearch(value){
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function updateFormationDatalist(){
  const datalist = document.getElementById('lista-formacoes');
  if(!datalist) return;

  const base = [
    'Formação Furnas',
    'Formação Ponta Grossa',
    'Formação São Domingos'
  ];

  const customs = (customFormations || []).map(f => f.name);

  const all = [...new Set([...base, ...customs])];

  datalist.innerHTML = all
    .map(nome => `<option value="${escapeHtml(nome)}"></option>`)
    .join('');
}

function getSelectedFossils(){
  return Array.from(document.querySelectorAll('.fossil-check:checked'))
    .map(input => input.value);
}

function updateFossilTextarea(){
  const textarea = document.getElementById('fosseis_encontrados');
  if(!textarea) return;

  const selected = getSelectedFossils();
  const manual = textarea.dataset.manual || '';

  const selectedText = selected.join('; ');

  if(manual && manual.trim()){
    textarea.value = selectedText ? `${selectedText}; ${manual}` : manual;
  }else{
    textarea.value = selectedText;
  }
}

function renderFossilChecklist(){
  const box = document.getElementById('fossil-checklist');
  const search = document.getElementById('fossil-search');

  if(!box) return;

  const query = normalizeTextForSearch(search?.value || '');

  const selected = new Set(getSelectedFossils());

  const filtered = fossilLibraryDevonianoPR.filter(f => {
    const haystack = normalizeTextForSearch(`${f.nome} ${f.grupo}`);
    return !query || haystack.includes(query);
  });

  box.innerHTML = filtered.map(f => {
    const checked = selected.has(f.nome) ? 'checked' : '';

    return `
      <label class="fossil-option">
        <input type="checkbox" class="fossil-check" value="${escapeHtml(f.nome)}" ${checked}>
        <span>
          ${escapeHtml(f.nome)}
          <small>${escapeHtml(f.grupo)}</small>
        </span>
      </label>
    `;
  }).join('');

  box.querySelectorAll('.fossil-check').forEach(input => {
    input.addEventListener('change', updateFossilTextarea);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  updateFormationDatalist();
  renderFossilChecklist();

  const fossilSearch = document.getElementById('fossil-search');
  if(fossilSearch){
    fossilSearch.addEventListener('input', renderFossilChecklist);
  }

  const fossilTextarea = document.getElementById('fosseis_encontrados');
  if(fossilTextarea){
    fossilTextarea.addEventListener('input', () => {
      const selected = getSelectedFossils().join('; ');
      let value = fossilTextarea.value;

      if(selected && value.startsWith(selected)){
        value = value.replace(selected, '').replace(/^;\s*/, '');
      }

      fossilTextarea.dataset.manual = value;
    });
  }
});


// GPS rápido no topo do formulário
document.addEventListener('DOMContentLoaded', () => {
  const quickGpsSimple = document.getElementById('quick-gps');
  const gpsBtnSimple = document.getElementById('use-location');

  if(quickGpsSimple && gpsBtnSimple){
    quickGpsSimple.addEventListener('click', () => gpsBtnSimple.click());
  }
});
