// ===== Utility Functions =====
const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
const parseTime = t => { if(!t) return null; const [h,m]=t.split(':').map(Number); return h*60+m; };
const formatTime = mins => `${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;
function setStatus(msg, type='info') {
  const box = $('#statusMessage');
  if(!box) return;
  box.className = '';
  const map = { info:'text-secondary', success:'text-success', error:'text-danger', warning:'text-warning'};
  box.classList.add(map[type]||map.info);
  box.textContent = msg;
}
function toggleLoading(on){
  const sp = $('#loadingSpinner');
  if(!sp) return; if(on) sp.classList.remove('d-none'); else sp.classList.add('d-none');
}
// Modal helpers
function showLoadingModal(title='Processing', message='Please wait...'){
  const modal = $('#loadingModal');
  if(!modal) return;
  $('#loadingModalTitle').textContent = title;
  $('#loadingModalMessage').textContent = message;
  $('#loadingSpinnerModal').classList.remove('d-none');
  $('#loadingSuccessIcon').classList.add('d-none');
  $('#loadingModalCloseBtn').classList.add('d-none');
  modal.style.display='flex';
}
function showSuccessModal(message='Success'){
  $('#loadingSpinnerModal').classList.add('d-none');
  $('#loadingSuccessIcon').classList.remove('d-none');
  $('#loadingModalTitle').textContent = 'Success';
  $('#loadingModalMessage').textContent = message;
  const closeBtn = $('#loadingModalCloseBtn');
  closeBtn.classList.remove('d-none');
  closeBtn.focus();
}
function showErrorModal(message='Error'){
  $('#loadingSpinnerModal').classList.add('d-none');
  $('#loadingSuccessIcon').classList.add('d-none');
  $('#loadingModalTitle').textContent = 'Error';
  $('#loadingModalMessage').textContent = message;
  const closeBtn = $('#loadingModalCloseBtn');
  closeBtn.classList.remove('d-none');
  closeBtn.focus();
}
function hideLoadingModal(){
  const modal = $('#loadingModal');
  if(modal) modal.style.display='none';
}
document.addEventListener('click', e => { if(e.target.id==='loadingModalCloseBtn') hideLoadingModal(); });
function normalizeName(name){
  return name.toLowerCase().replace(/[^a-z0-9]+/g,'_');
}

// Required custom fields definition (canonicalName -> meta)
const requiredFieldDefs = [
  { display: 'Job Type', canonical: 'job_type', field_type: 'enum', options: ['Installation','Repair','Maintenance','Consultation'] },
  { display: 'Job Source', canonical: 'job_source', field_type: 'enum', options: ['Website','Phone','Referral','Social Media'] },
  { display: 'Job Description', canonical: 'job_description', field_type: 'text' },
  { display: 'Service Address', canonical: 'service_address', field_type: 'text' },
  { display: 'Service City', canonical: 'service_city', field_type: 'text' },
  { display: 'Service State', canonical: 'service_state', field_type: 'text' },
  { display: 'Service Zip Code', canonical: 'service_zip_code', field_type: 'text' },
  { display: 'Service Area', canonical: 'service_area', field_type: 'enum', options: ['North','South','East','West'] },
  { display: 'Service Start Date', canonical: 'service_start_date', field_type: 'date' },
  { display: 'Service Start Time', canonical: 'service_start_time', field_type: 'time' },
  { display: 'Service End Time', canonical: 'service_end_time', field_type: 'time' }
];

async function fetchDealFields(apiToken){
  const res = await fetch(`https://api.pipedrive.com/v1/dealFields?api_token=${apiToken}`);
  const json = await res.json();
  if(!json.success) throw new Error('Не удалось получить список полей');
  return json.data; // array
}

async function ensureRequiredFields(apiToken, existing){
  const existingNorm = new Map();
  existing.forEach(f => existingNorm.set(normalizeName(f.name), f));
  const created = [];
  for(const def of requiredFieldDefs){
    if(!existingNorm.has(def.canonical)){
      const payload = { name: def.display, field_type: def.field_type };
      if(def.options) payload.options = def.options.map(o=>({label:o}));
      try {
        const res = await fetch(`https://api.pipedrive.com/v1/dealFields?api_token=${apiToken}`, {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
        });
        const j = await res.json();
        if(j.success){ created.push(j.data); existingNorm.set(def.canonical, j.data); }
        else console.warn('Не создано поле', def.display, j.error);
      } catch(e){ console.error('Ошибка создания поля', def.display, e); }
    }
  }
  return Array.from(existingNorm.values());
}

function buildCustomFieldsMap(fields){
  const map = new Map();
  fields.forEach(f => map.set(normalizeName(f.name), f.key));
  return map;
}

function buildCustomFieldsPayload(fieldMap, formData){
  const valueByCanonical = {
    job_type: formData.job_type || null,
    job_source: formData.job_source || null,
    job_description: formData.job_description || null,
    service_address: formData.address || null,
    service_city: formData.city || null,
    service_state: formData.state || null,
    service_zip_code: formData.zip_code || null,
    service_area: formData.area || null,
    service_start_date: formData.start_date || null,
    service_start_time: formData.start_time || null,
    service_end_time: formData.end_time || null
  };
  const payload = {};
  Object.entries(valueByCanonical).forEach(([canon,val]) => {
    if(val && fieldMap.has(canon)) payload[fieldMap.get(canon)] = val;
  });
  return payload;
}

function validateTimeRange(start, end){
  if(!start || !end) return true; // other required checks elsewhere
  return parseTime(end) > parseTime(start);
}

document.getElementById('jobForm').addEventListener('submit', async function(e){
  e.preventDefault();
  setStatus('Отправка...', 'info');
  toggleLoading(true);
  showLoadingModal('Processing','Creating deal...');

  const formData = new FormData(this);
  const data = Object.fromEntries(formData.entries());
  // Hardcoded token (requested revert) WARNING: not secure
  const apiToken = "c40a439d34337a700705c1f1b902ffeb83ee2297";

  // Time validation
  if(!validateTimeRange(data.start_time, data.end_time)){
    setStatus('End time должно быть позже Start time', 'error');
    toggleLoading(false);
    return;
  }

  try {
    // 1. Fetch existing fields once
    const initialFields = await fetchDealFields(apiToken);
    // 2. Ensure required fields
    const allFields = await ensureRequiredFields(apiToken, initialFields);
    // 3. Build map for updates
    const fieldMap = buildCustomFieldsMap(allFields);

    // 4. Create person
    const personRes = await fetch(`https://api.pipedrive.com/v1/persons?api_token=${apiToken}`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
        name: `${data.first_name} ${data.last_name}`.trim(),
        phone: data.phone, email: data.email || undefined
      })
    });
    const personJson = await personRes.json();
    if(!personJson.success) throw new Error('Ошибка создания контакта');
    const personId = personJson.data.id;

    // 5. Create deal
    const dealPayload = {
      title: `${data.first_name} ${data.last_name} - ${data.job_type || 'Service'}`,
      person_id: personId,
      value: 0,
      currency: 'USD',
      status: 'open',
      expected_close_date: data.start_date || undefined
    };
    const dealRes = await fetch(`https://api.pipedrive.com/v1/deals?api_token=${apiToken}`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(dealPayload)
    });
    const dealJson = await dealRes.json();
    if(!dealJson.success) throw new Error('Ошибка создания сделки');
    const dealId = dealJson.data.id;

    // 6. Update custom fields
    const customFieldsPayload = buildCustomFieldsPayload(fieldMap, data);
    if(Object.keys(customFieldsPayload).length){
      const updRes = await fetch(`https://api.pipedrive.com/v1/deals/${dealId}?api_token=${apiToken}`, {
        method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(customFieldsPayload)
      });
      const updJson = await updRes.json();
      if(!updJson.success) console.warn('Не все кастомные поля обновлены', updJson);
    }

  setStatus(`Сделка #${dealId} создана успешно`, 'success');
  showSuccessModal(`Deal #${dealId} created successfully`);
    this.reset();
  } catch(err){
    console.error(err);
  setStatus(err.message || 'Неизвестная ошибка', 'error');
  showErrorModal(err.message || 'Error');
  } finally {
    toggleLoading(false);
  }
});


let currentDropdown = null;


document.addEventListener('DOMContentLoaded', function() {
  initializeInlineWheels();
  attachTimePickerEvents();
});

function initializeInlineWheels() {
  
  ['Start', 'End'].forEach(type => {
    const hoursContainer = document.getElementById(`hoursWheelSmall${type}`);
    const minutesContainer = document.getElementById(`minutesWheelSmall${type}`);
    
    
    for (let i = 0; i <= 23; i++) {
      const hourDiv = document.createElement('div');
      hourDiv.className = 'wheel-item-small';
      hourDiv.textContent = i.toString().padStart(2, '0');
      hourDiv.addEventListener('click', () => selectInlineTime(type, i, null));
      hoursContainer.appendChild(hourDiv);
    }

    
    for (let i = 0; i <= 45; i += 15) {
      const minuteDiv = document.createElement('div');
      minuteDiv.className = 'wheel-item-small';
      minuteDiv.textContent = i.toString().padStart(2, '0');
      minuteDiv.addEventListener('click', () => selectInlineTime(type, null, i));
      minutesContainer.appendChild(minuteDiv);
    }

    
    addInlineWheelScrolling(`hours-${type.toLowerCase()}`, `hoursWheelSmall${type}`, type, 'hours');
    addInlineWheelScrolling(`minutes-${type.toLowerCase()}`, `minutesWheelSmall${type}`, type, 'minutes');
  });
}

function attachTimePickerEvents() {
  
  document.querySelectorAll('.time-picker-input').forEach(input => {
    input.addEventListener('click', function(e) {
      e.stopPropagation();
      openInlineDropdown(this);
    });
  });

  
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.time-picker-container')) {
      closeAllDropdowns();
    }
  });
}

function openInlineDropdown(input) {
  closeAllDropdowns();
  
  const container = input.closest('.time-picker-container');
  const dropdown = container.querySelector('.time-dropdown');
  const type = input.getAttribute('data-time-picker') === 'start' ? 'Start' : 'End';
  
  // Parse current time and update wheels
  const currentTime = input.value || '09:00';
  const [hours, minutes] = currentTime.split(':').map(Number);
  
  updateInlineWheelPositions(type, hours, Math.floor(minutes / 15) * 15);
  
  dropdown.classList.add('show');
  currentDropdown = dropdown;
}

function closeAllDropdowns() {
  document.querySelectorAll('.time-dropdown').forEach(dropdown => {
    dropdown.classList.remove('show');
  });
  currentDropdown = null;
}

function selectInlineTime(type, hour, minute) {
  const inputName = type === 'Start' ? 'start_time' : 'end_time';
  const input = document.querySelector(`input[name="${inputName}"]`);
  
  if (!input) return;
  
  const currentTime = input.value || '09:00';
  const [currentHour, currentMinute] = currentTime.split(':').map(Number);
  
  const newHour = hour !== null ? hour : currentHour;
  const newMinute = minute !== null ? minute : Math.floor(currentMinute / 15) * 15;
  
  const timeString = `${newHour.toString().padStart(2, '0')}:${newMinute.toString().padStart(2, '0')}`;
  input.value = timeString;
  
  updateInlineWheelPositions(type, newHour, newMinute);
}

function updateInlineWheelPositions(type, hour, minute) {
  const hoursWheel = document.getElementById(`hoursWheelSmall${type}`);
  const minutesWheel = document.getElementById(`minutesWheelSmall${type}`);
  
  // Update active states
  hoursWheel.querySelectorAll('.wheel-item-small').forEach((item, index) => {
    item.classList.toggle('active', index === hour);
  });
  
  minutesWheel.querySelectorAll('.wheel-item-small').forEach((item, index) => {
    item.classList.toggle('active', index === minute / 15);
  });
  
  
  const hourOffset = -hour * 20; 
  const minuteOffset = -(minute / 15) * 20;
  
  hoursWheel.style.transform = `translateY(${hourOffset}px)`;
  minutesWheel.style.transform = `translateY(${minuteOffset}px)`;
}

function addInlineWheelScrolling(wheelId, itemsId, type, wheelType) {
  const wheel = document.querySelector(`[data-wheel="${wheelId}"]`);
  const items = document.getElementById(itemsId);
  let isScrolling = false;
  let startY = 0;
  let currentY = 0;
  let velocity = 0;
  let animationFrame = null;

  function getItemIndex(offset) {
    return Math.max(0, Math.min(Math.round(-offset / 20), items.children.length - 1));
  }

  function updateFromScroll() {
    const transform = items.style.transform;
    const currentOffset = transform ? parseInt(transform.match(/-?\d+/)?.[0] || '0') : 0;
    const newIndex = getItemIndex(currentOffset);
    
    if (wheelType === 'hours') {
      selectInlineTime(type, newIndex, null);
    } else {
      selectInlineTime(type, null, newIndex * 15);
    }
  }

  // Mouse events
  wheel.addEventListener('mousedown', function(e) {
    e.preventDefault();
    isScrolling = true;
    startY = e.clientY;
    velocity = 0;
    wheel.style.cursor = 'grabbing';
    if (animationFrame) cancelAnimationFrame(animationFrame);
  });

  document.addEventListener('mousemove', function(e) {
    if (!isScrolling) return;
    
    currentY = e.clientY;
    const deltaY = currentY - startY;
    const currentTransform = items.style.transform;
    const currentOffset = currentTransform ? parseInt(currentTransform.match(/-?\d+/)?.[0] || '0') : 0;
    
    const newOffset = Math.max(-(items.children.length - 1) * 20, Math.min(0, currentOffset + deltaY));
    items.style.transform = `translateY(${newOffset}px)`;
    
    velocity = deltaY;
    startY = currentY;
    updateFromScroll();
  });

  document.addEventListener('mouseup', function() {
    if (!isScrolling) return;
    isScrolling = false;
    wheel.style.cursor = 'grab';
    
    
    if (Math.abs(velocity) > 3) {
      let currentTransform = items.style.transform;
      let currentOffset = currentTransform ? parseInt(currentTransform.match(/-?\d+/)?.[0] || '0') : 0;
      
      function momentum() {
        velocity *= 0.92;
        currentOffset += velocity;
        currentOffset = Math.max(-(items.children.length - 1) * 20, Math.min(0, currentOffset));
        
        items.style.transform = `translateY(${currentOffset}px)`;
        updateFromScroll();
        
        if (Math.abs(velocity) > 0.3) {
          animationFrame = requestAnimationFrame(momentum);
        } else {
          // Snap to nearest item
          const nearestIndex = getItemIndex(currentOffset);
          const snapOffset = -nearestIndex * 20;
          items.style.transform = `translateY(${snapOffset}px)`;
          updateFromScroll();
        }
      }
      momentum();
    }
  });

  
  wheel.addEventListener('touchstart', function(e) {
    isScrolling = true;
    startY = e.touches[0].clientY;
    velocity = 0;
    if (animationFrame) cancelAnimationFrame(animationFrame);
  });

  wheel.addEventListener('touchmove', function(e) {
    if (!isScrolling) return;
    e.preventDefault();
    
    currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;
    const currentTransform = items.style.transform;
    const currentOffset = currentTransform ? parseInt(currentTransform.match(/-?\d+/)?.[0] || '0') : 0;
    
    const newOffset = Math.max(-(items.children.length - 1) * 20, Math.min(0, currentOffset + deltaY));
    items.style.transform = `translateY(${newOffset}px)`;
    
    velocity = deltaY;
    startY = currentY;
    updateFromScroll();
  });

  wheel.addEventListener('touchend', function() {
    if (!isScrolling) return;
    isScrolling = false;
    
    if (Math.abs(velocity) > 3) {
      let currentTransform = items.style.transform;
      let currentOffset = currentTransform ? parseInt(currentTransform.match(/-?\d+/)?.[0] || '0') : 0;
      
      function momentum() {
        velocity *= 0.92;
        currentOffset += velocity;
        currentOffset = Math.max(-(items.children.length - 1) * 20, Math.min(0, currentOffset));
        
        items.style.transform = `translateY(${currentOffset}px)`;
        updateFromScroll();
        
        if (Math.abs(velocity) > 0.3) {
          animationFrame = requestAnimationFrame(momentum);
        } else {
          const nearestIndex = getItemIndex(currentOffset);
          const snapOffset = -nearestIndex * 20;
          items.style.transform = `translateY(${snapOffset}px)`;
          updateFromScroll();
        }
      }
      momentum();
    }
  });

  // Wheel scroll events (mouse wheel)
  wheel.addEventListener('wheel', function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const currentTransform = items.style.transform;
    const currentOffset = currentTransform ? parseInt(currentTransform.match(/-?\d+/)?.[0] || '0') : 0;
    
    // Determine scroll direction and amount
    const scrollDirection = e.deltaY > 0 ? 1 : -1;
    const scrollAmount = 20; // One item height
    
    let newOffset = currentOffset - (scrollDirection * scrollAmount);
    newOffset = Math.max(-(items.children.length - 1) * 20, Math.min(0, newOffset));
    
    // Apply smooth transition
    items.style.transition = 'transform 0.2s ease';
    items.style.transform = `translateY(${newOffset}px)`;
    
    // Update the selected time
    updateFromScroll();
    
    // Remove transition after animation
    setTimeout(() => {
      items.style.transition = '';
    }, 200);
  });
}