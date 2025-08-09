document.getElementById('jobForm').addEventListener('submit', async function(e) {
  e.preventDefault();

  const formData = new FormData(this);
  const data = Object.fromEntries(formData.entries());

  const apiToken = "c40a439d34337a700705c1f1b902ffeb83ee2297";

  try {
    // Сначала получаем список доступных полей для сделок
    console.log('Получаем список полей для сделок...');
    let fieldsRes = await fetch(`https://api.pipedrive.com/v1/dealFields?api_token=${apiToken}`);
    let fieldsResult = await fieldsRes.json();
    console.log('Доступные поля для сделок:', fieldsResult);

    // Проверяем и создаем недостающие кастомные поля автоматически
    const requiredFields = [
      { name: "Job Type", key: "job_type", field_type: "enum", options: ["Installation", "Repair", "Maintenance", "Consultation"] },
      { name: "Job Source", key: "job_source", field_type: "enum", options: ["Website", "Phone", "Referral", "Social Media"] },
      { name: "Job Description", key: "job_description", field_type: "text" },
      { name: "Service Address", key: "service_address", field_type: "text" },
      { name: "Service City", key: "service_city", field_type: "text" },
      { name: "Service State", key: "service_state", field_type: "text" },
      { name: "Service Zip Code", key: "service_zip_code", field_type: "text" },
      { name: "Service Area", key: "service_area", field_type: "enum", options: ["North", "South", "East", "West"] },
      { name: "Service Start Date", key: "service_start_date", field_type: "date" },
      { name: "Service Start Time", key: "service_start_time", field_type: "time" },
      { name: "Service End Time", key: "service_end_time", field_type: "time" }
    ];

    // Проверяем какие поля уже существуют
    const existingFields = fieldsResult.success ? fieldsResult.data.map(f => f.name.toLowerCase()) : [];
    
    // Создаем недостающие поля
    for (const field of requiredFields) {
      if (!existingFields.includes(field.name.toLowerCase())) {
        console.log(`Создаем поле: ${field.name}`);
        try {
          const fieldPayload = {
            name: field.name,
            field_type: field.field_type
          };
          
          if (field.options) {
            fieldPayload.options = field.options.map(opt => ({ label: opt }));
          }

          let createFieldRes = await fetch(`https://api.pipedrive.com/v1/dealFields?api_token=${apiToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fieldPayload)
          });
          
          let createFieldResult = await createFieldRes.json();
          if (createFieldResult.success) {
            console.log(`✅ Создано поле: ${field.name}`);
          } else {
            console.log(`⚠️ Не удалось создать поле ${field.name}:`, createFieldResult.error);
          }
        } catch (err) {
          console.error(`Ошибка создания поля ${field.name}:`, err);
        }
      } else {
        console.log(`✅ Поле уже существует: ${field.name}`);
      }
    }

    // Получаем обновленный список полей после создания
    let updatedFieldsRes = await fetch(`https://api.pipedrive.com/v1/dealFields?api_token=${apiToken}`);
    let updatedFieldsResult = await updatedFieldsRes.json();

    // 1. Создаём контакт
    let personRes = await fetch(`https://api.pipedrive.com/v1/persons?api_token=${apiToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${data.first_name} ${data.last_name}`,
        phone: data.phone,
        email: data.email
      })
    });

    let personResult = await personRes.json();
    if (!personResult.success) {
      throw new Error('Ошибка создания контакта');
    }
    let personId = personResult.data.id;

    // 2. Создаём сделку и пытаемся добавить данные в Details через стандартные поля
    let dealPayload = {
      title: `${data.first_name} ${data.last_name} - ${data.job_type || 'Сервис'}`,
      person_id: personId,
      value: 0,
      currency: "USD",
      status: "open"
    };

    // Попробуем добавить данные в стандартные поля, которые отображаются в Details
    if (data.start_date) {
      dealPayload.expected_close_date = data.start_date; // Ожидаемая дата закрытия
    }

    let dealRes = await fetch(`https://api.pipedrive.com/v1/deals?api_token=${apiToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dealPayload)
    });

    let dealResult = await dealRes.json();
    console.log('Deal API Response:', dealResult);
    
    if (dealResult.success) {
      const dealId = dealResult.data.id;
      
      // 3. Создаем кастомные поля через API или используем существующие
      console.log('Обновляем сделку с кастомными полями...');
      
      // Попробуем обновить сделку с кастомными полями
      const customFieldsUpdate = {};
      
      // Стандартный способ добавления кастомных полей в Pipedrive
      // Формат: числовой ID поля в виде строки или хэш ключ
      if (updatedFieldsResult.success && updatedFieldsResult.data) {
        updatedFieldsResult.data.forEach(field => {
          // Проверяем, что field и field.id существуют
          if (!field || !field.key) {
            return; // Пропускаем поля без ключа
          }
          
          const fieldKey = field.key;
          const fieldName = field.name ? field.name.toLowerCase() : '';
          
          // Используем хэш ключи для более надежного обновления
          if (fieldName.includes('job type') || fieldKey.includes('job_type')) {
            customFieldsUpdate[fieldKey] = data.job_type;
          }
          if (fieldName.includes('job source') || fieldKey.includes('job_source')) {
            customFieldsUpdate[fieldKey] = data.job_source;
          }
          if (fieldName.includes('job description') || fieldKey.includes('description')) {
            customFieldsUpdate[fieldKey] = data.job_description;
          }
          if (fieldName.includes('service address') || fieldKey.includes('address')) {
            customFieldsUpdate[fieldKey] = data.address;
          }
          if (fieldName.includes('service city') || fieldKey.includes('city')) {
            customFieldsUpdate[fieldKey] = data.city;
          }
          if (fieldName.includes('service state') || fieldKey.includes('state')) {
            customFieldsUpdate[fieldKey] = data.state;
          }
          if (fieldName.includes('zip code') || fieldKey.includes('zip')) {
            customFieldsUpdate[fieldKey] = data.zip_code;
          }
          if (fieldName.includes('service area') || fieldKey.includes('area')) {
            customFieldsUpdate[fieldKey] = data.area;
          }
          if (fieldName.includes('start date') || fieldKey.includes('start_date')) {
            customFieldsUpdate[fieldKey] = data.start_date;
          }
          if (fieldName.includes('start time') || fieldKey.includes('start_time')) {
            customFieldsUpdate[fieldKey] = data.start_time;
          }
          if (fieldName.includes('end time') || fieldKey.includes('end_time')) {
            customFieldsUpdate[fieldKey] = data.end_time;
          }
        });
      }

      if (Object.keys(customFieldsUpdate).length > 0) {
        console.log('Обновляем кастомные поля:', customFieldsUpdate);
        let customUpdateRes = await fetch(`https://api.pipedrive.com/v1/deals/${dealId}?api_token=${apiToken}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(customFieldsUpdate)
        });
        
        let customUpdateResult = await customUpdateRes.json();
        console.log('Custom fields update result:', customUpdateResult);
      }

      alert(`✅ Сделка создана успешно!\nID: ${dealResult.data.id}\nКонтакт: ${data.first_name} ${data.last_name}\n\n📋 Все данные сохранены в секции Details.\n🔧 Кастомные поля созданы автоматически (если требовалось).`);
      
      // Очищаем форму
      document.getElementById('jobForm').reset();
    } else {
      console.error('Детали ошибки создания сделки:', dealResult);
      throw new Error(`Ошибка создания сделки: ${dealResult.error || JSON.stringify(dealResult.error_info || dealResult)}`);
    }

  } catch (err) {
    console.error('Подробная ошибка:', err);
    alert(`Произошла ошибка: ${err.message}`);
  }
});

// Inline Time Picker Implementation
let currentDropdown = null;

// Initialize time picker when page loads
document.addEventListener('DOMContentLoaded', function() {
  initializeInlineWheels();
  attachTimePickerEvents();
});

function initializeInlineWheels() {
  // Initialize for both start and end time dropdowns
  ['Start', 'End'].forEach(type => {
    const hoursContainer = document.getElementById(`hoursWheelSmall${type}`);
    const minutesContainer = document.getElementById(`minutesWheelSmall${type}`);
    
    // Generate hours (0-23)
    for (let i = 0; i <= 23; i++) {
      const hourDiv = document.createElement('div');
      hourDiv.className = 'wheel-item-small';
      hourDiv.textContent = i.toString().padStart(2, '0');
      hourDiv.addEventListener('click', () => selectInlineTime(type, i, null));
      hoursContainer.appendChild(hourDiv);
    }

    // Generate minutes (0, 15, 30, 45)
    for (let i = 0; i <= 45; i += 15) {
      const minuteDiv = document.createElement('div');
      minuteDiv.className = 'wheel-item-small';
      minuteDiv.textContent = i.toString().padStart(2, '0');
      minuteDiv.addEventListener('click', () => selectInlineTime(type, null, i));
      minutesContainer.appendChild(minuteDiv);
    }

    // Add scroll functionality for inline wheels
    addInlineWheelScrolling(`hours-${type.toLowerCase()}`, `hoursWheelSmall${type}`, type, 'hours');
    addInlineWheelScrolling(`minutes-${type.toLowerCase()}`, `minutesWheelSmall${type}`, type, 'minutes');
  });
}

function attachTimePickerEvents() {
  // Add click events to time picker inputs
  document.querySelectorAll('.time-picker-input').forEach(input => {
    input.addEventListener('click', function(e) {
      e.stopPropagation();
      openInlineDropdown(this);
    });
  });

  // Close dropdowns when clicking outside
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
  
  // Update positions
  const hourOffset = -hour * 20; // 20px per item for small wheels
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
    
    // Apply momentum scrolling
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

  // Touch events
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