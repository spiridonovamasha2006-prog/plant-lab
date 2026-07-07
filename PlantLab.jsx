import React, { useState, useEffect, useRef, useCallback } from 'react';

/* =======================================================================
   ЛАБОРАТОРИЯ РАСТЕНИЙ
   ======================================================================= */

let nextId = 1;
const uid = () => nextId++;

/* ---- Справочник видов ---- */
const SPECIES_INFO = {
  herbera:  { name: 'Гербера',  icon: '🌸' },
  yablonya: { name: 'Яблоня',   icon: '🌳' },
  kaktus:   { name: 'Кактус',   icon: '🌵' },
  tomat:    { name: 'Томат',    icon: '🍅' },
  orhideya: { name: 'Орхидея',  icon: '🌺' },
};

function getStageIcon(plant) {
  if (plant.stage === 'Семя')        return '🌰';
  if (plant.stage === 'Проросток')   return '🌱';
  if (plant.stage === 'Вегетация')   return '🌿';
  if (plant.stage === 'Смерть')      return '☠️';
  if (plant.stage === 'Дерево')      return '🌳';
  if (plant.stage === 'Плодоношение') return '🍅';
  if (plant.stage === 'Цветение') {
    if (plant.def?.icon) return plant.def.icon;
    return SPECIES_INFO[plant.species]?.icon ?? '🌼';
  }
  return '🌱';
}

/* =======================================================================
   КЛАСС Plant — базовый
   ======================================================================= */
class Plant {
  constructor(name, species) {
    this.id = uid();
    this.name = name;
    this.species = species;
    this.stage = 'Семя';
    this.health = 100;
    this.age = 0;
    this.alive = true;
    this.daysInStage = 0;
    this.lowHealthWarned = false;
    // Лог причин смерти: { day, reasons[] }
    this.deathCause = null;
  }

  changeStage(newStage) {
    this.stage = newStage;
    this.daysInStage = 0;
  }

  clampHealth() {
    if (this.health > 100) this.health = 100;
    if (this.health < 0)   this.health = 0;
  }

  warnLowHealth(events, extra = '') {
    if (this.health < 30 && this.health > 0 && !this.lowHealthWarned) {
      this.lowHealthWarned = true;
      events.push({ text: `${this.name}: Здоровье упало до ${Math.round(this.health)}%${extra}`, level: 'warning' });
    } else if (this.health >= 30) {
      this.lowHealthWarned = false;
    }
  }

  // Записываем причины смерти и меняем стадию
  checkDeath(events, conditions, day) {
    if (this.alive && this.health <= 0) {
      this.alive = false;
      this.changeStage('Смерть');
      // Собираем причины: какие параметры были вне нормы
      const reasons = this.collectDeathReasons(conditions);
      this.deathCause = { day, reasons };
      const reasonText = reasons.length > 0
        ? ` Причина: ${reasons.join(', ')}.`
        : '';
      events.push({ text: `${this.name}: Растение погибло на день ${this.age}.${reasonText}`, level: 'critical' });
    }
  }

  // Переопределяется в наследниках для конкретных причин
  collectDeathReasons(conditions) {
    return [];
  }

  // Питательность почвы (нутриенты) ускоряет прохождение стадий через множитель.
  // nutrients 0-100: < 30 — штраф к росту, > 70 — бонус, иначе нейтрально.
  getNutrientBonus(conditions) {
    const n = conditions.nutrients ?? 50;
    if (n < 20) return -1;    // сильное голодание
    if (n < 40) return -0.5;  // лёгкое голодание
    if (n > 80) return 1;     // удобрение ускоряет
    if (n > 60) return 0.5;   // лёгкий бонус
    return 0;
  }

  // Общий эффект почвенной влажности (soil) для всех видов
  applySoilEffect(conditions) {
    const soil = conditions.soil ?? 50;
    if (soil < 20 || soil > 90) {
      this.health -= 1;
    } else {
      this.health += 0.2;
    }
  }

  tick(conditions, day) {
    this.age++;
    this.daysInStage++;
    const events = [];
    if (!this.alive) return events;

    this.applyConditions(conditions, events);
    this.applySoilEffect(conditions);

    this.clampHealth();
    this.checkDeath(events, conditions, day);
    return events;
  }

  applyConditions(conditions, events) {
    // переопределяется в наследниках
  }
}

/* =======================================================================
   ВИДЫ РАСТЕНИЙ
   ======================================================================= */

/* ---- Гербера ---- */
class Herbera extends Plant {
  constructor(name) { super(name, 'herbera'); }

  collectDeathReasons(c) {
    const r = [];
    if (c.temp < 10 || c.temp > 35) r.push(`температура ${c.temp}°C (норма 10–35°C)`);
    if (c.light < 20)               r.push(`свет ${c.light}% (нужно >20%)`);
    if (c.soil < 20 || c.soil > 90) r.push(`почвенная влажность ${c.soil}%`);
    return r;
  }

  applyConditions(conditions, events) {
    const { temp, light } = conditions;
    const nb = this.getNutrientBonus(conditions);

    if (temp < 10 || temp > 35) this.health -= 3;
    else                         this.health += 0.5;

    if (light < 20) this.health -= 1;
    else            this.health += 0.5;

    // Питательность влияет на скорость перехода стадий через нормировку daysInStage
    const stageMult = 1 + nb * 0.2; // бонус/штраф к числу требуемых дней

    if (this.stage === 'Семя' && this.daysInStage >= Math.round(3 / Math.max(0.5, stageMult))) {
      this.changeStage('Проросток');
      events.push({ text: `${this.name}: Переход → "Проросток"`, level: 'info' });
    } else if (this.stage === 'Проросток' && this.daysInStage >= Math.round(4 / Math.max(0.5, stageMult))) {
      this.changeStage('Вегетация');
      events.push({ text: `${this.name}: Переход → "Вегетация"`, level: 'info' });
    } else if (this.stage === 'Вегетация' && temp >= 20 && temp <= 25 && light > 70 && this.daysInStage >= Math.round(3 / Math.max(0.5, stageMult))) {
      this.changeStage('Цветение');
      events.push({ text: `${this.name}: Переход → "Цветение" (${temp}°C, свет ${light}%)`, level: 'success' });
    }

    this.warnLowHealth(events, ` (темп ${temp}°C, свет ${light}%)`);
  }
}

/* ---- Яблоня ---- */
class Yablonya extends Plant {
  constructor(name) {
    super(name, 'yablonya');
    this.coldDays = 0;
    this.stratified = false;
  }

  collectDeathReasons(c) {
    const r = [];
    if (!this.stratified) r.push('не прошла стратификация (нужно 2 дня при темп < 5°C)');
    if (c.temp < -10 || c.temp > 40) r.push(`температура ${c.temp}°C (норма −10…+40°C)`);
    return r;
  }

  applyConditions(conditions, events) {
    const { temp, light } = conditions;
    const nb = this.getNutrientBonus(conditions);
    const stageMult = 1 + nb * 0.2;

    if (this.stage === 'Семя') {
      if (temp < 5) {
        this.coldDays++;
        if (this.coldDays === 1) events.push({ text: `${this.name}: Начало стратификации (${temp}°C)`, level: 'info' });
        if (this.coldDays >= 2 && !this.stratified) {
          this.stratified = true;
          this.changeStage('Проросток');
          events.push({ text: `${this.name}: Стратификация завершена! → "Проросток"`, level: 'success' });
        }
      }
      if (!this.stratified && this.daysInStage >= 10) {
        this.health = 0;
      }
    } else {
      if (this.stage === 'Проросток' && this.daysInStage >= Math.round(5 / Math.max(0.5, stageMult))) {
        this.changeStage('Вегетация');
        events.push({ text: `${this.name}: Переход → "Вегетация"`, level: 'info' });
      } else if (this.stage === 'Вегетация' && this.daysInStage >= Math.round(6 / Math.max(0.5, stageMult)) && this.health > 50) {
        this.changeStage('Дерево');
        events.push({ text: `${this.name}: Переход → "Дерево"`, level: 'success' });
      }
      if (temp < -10 || temp > 40) this.health -= 2;
      else                          this.health += 0.5;
      if (light < 10) this.health -= 1;
      else            this.health += 0.3;
    }

    this.warnLowHealth(events, ` (темп ${temp}°C)`);
  }
}

/* ---- Кактус ---- */
class Kaktus extends Plant {
  constructor(name) { super(name, 'kaktus'); }

  collectDeathReasons(c) {
    const r = [];
    if (c.humidity > 70)            r.push(`влажность ${c.humidity}% — загнивает (норма <70%)`);
    if (c.temp < 10)                r.push(`температура ${c.temp}°C — слишком холодно (норма >10°C)`);
    if (c.light < 30)               r.push(`свет ${c.light}% (норма >30%)`);
    if (c.soil < 20 || c.soil > 90) r.push(`почвенная влажность ${c.soil}%`);
    return r;
  }

  applyConditions(conditions, events) {
    const { temp, light, humidity } = conditions;
    const nb = this.getNutrientBonus(conditions);
    const stageMult = 1 + nb * 0.2;

    if (humidity > 70) this.health -= 5;
    else               this.health += 0.3;
    if (temp < 10)     this.health -= 4;
    else               this.health += 0.3;
    if (light < 30)    this.health -= 1;
    else               this.health += 0.4;

    if (this.stage === 'Семя' && this.daysInStage >= Math.round(3 / Math.max(0.5, stageMult))) {
      this.changeStage('Проросток');
      events.push({ text: `${this.name}: Переход → "Проросток"`, level: 'info' });
    } else if (this.stage === 'Проросток' && this.daysInStage >= Math.round(4 / Math.max(0.5, stageMult))) {
      this.changeStage('Вегетация');
      events.push({ text: `${this.name}: Переход → "Вегетация"`, level: 'info' });
    } else if (this.stage === 'Вегетация' && temp >= 30 && temp <= 40 && humidity < 30 && this.daysInStage >= Math.round(3 / Math.max(0.5, stageMult))) {
      this.changeStage('Цветение');
      events.push({ text: `${this.name}: Переход → "Цветение" (${temp}°C, влажность ${humidity}%)`, level: 'success' });
    }

    this.warnLowHealth(events, ` (влажность ${humidity}%)`);
  }
}

/* ---- Томат ---- */
class Tomat extends Plant {
  constructor(name) { super(name, 'tomat'); }

  collectDeathReasons(c) {
    const r = [];
    if (c.humidity < 30)            r.push(`влажность ${c.humidity}% — слишком сухо (норма >30%)`);
    if (c.temp < 5 || c.temp > 40)  r.push(`температура ${c.temp}°C (норма 5–40°C)`);
    if (c.light < 20)               r.push(`свет ${c.light}% (норма >20%)`);
    if (c.soil < 20 || c.soil > 90) r.push(`почвенная влажность ${c.soil}%`);
    return r;
  }

  applyConditions(conditions, events) {
    const { temp, light, humidity } = conditions;
    const nb = this.getNutrientBonus(conditions);
    const stageMult = 1 + nb * 0.2;
    const goodForFruit = temp >= 22 && temp <= 28 && light > 60 && humidity >= 50 && humidity <= 80;

    if (humidity < 30) this.health -= 3;
    else               this.health += 0.4;
    if (temp < 5 || temp > 40) this.health -= 2;
    else                        this.health += 0.3;
    if (light < 20) this.health -= 1;
    else            this.health += 0.3;

    if (this.stage === 'Семя' && this.daysInStage >= Math.round(3 / Math.max(0.5, stageMult))) {
      this.changeStage('Проросток');
      events.push({ text: `${this.name}: Переход → "Проросток"`, level: 'info' });
    } else if (this.stage === 'Проросток' && this.daysInStage >= Math.round(4 / Math.max(0.5, stageMult))) {
      this.changeStage('Вегетация');
      events.push({ text: `${this.name}: Переход → "Вегетация"`, level: 'info' });
    } else if (this.stage === 'Вегетация' && goodForFruit && this.daysInStage >= Math.round(3 / Math.max(0.5, stageMult))) {
      this.changeStage('Цветение');
      events.push({ text: `${this.name}: Переход → "Цветение" (${temp}°C, свет ${light}%)`, level: 'success' });
    } else if (this.stage === 'Цветение' && goodForFruit && this.daysInStage >= Math.round(3 / Math.max(0.5, stageMult))) {
      this.changeStage('Плодоношение');
      events.push({ text: `${this.name}: Переход → "Плодоношение"`, level: 'success' });
    }

    this.warnLowHealth(events, ` (влажность ${humidity}%)`);
  }
}

/* ---- Орхидея ---- */
class Orhideya extends Plant {
  constructor(name) { super(name, 'orhideya'); }

  collectDeathReasons(c) {
    const r = [];
    if (c.temp < 18 || c.temp > 25)         r.push(`температура ${c.temp}°C (норма 18–25°C)`);
    if (c.humidity < 60 || c.humidity > 80) r.push(`влажность ${c.humidity}% (норма 60–80%)`);
    if (c.light < 40 || c.light > 60)       r.push(`свет ${c.light}% (норма 40–60%)`);
    if (c.soil < 20 || c.soil > 90)         r.push(`почвенная влажность ${c.soil}%`);
    return r;
  }

  applyConditions(conditions, events) {
    const { temp, light, humidity } = conditions;
    const nb = this.getNutrientBonus(conditions);
    const stageMult = 1 + nb * 0.2;
    const tempOk  = temp >= 18 && temp <= 25;
    const humOk   = humidity >= 60 && humidity <= 80;
    const lightOk = light >= 40 && light <= 60;
    const allOk   = tempOk && humOk && lightOk;

    if (!tempOk)  this.health -= 2;
    if (!humOk)   this.health -= 2;
    if (!lightOk) this.health -= 2;
    if (allOk)    this.health += 1;

    if (this.stage === 'Семя' && this.daysInStage >= Math.round(3 / Math.max(0.5, stageMult))) {
      this.changeStage('Проросток');
      events.push({ text: `${this.name}: Переход → "Проросток"`, level: 'info' });
    } else if (this.stage === 'Проросток' && this.daysInStage >= Math.round(4 / Math.max(0.5, stageMult))) {
      this.changeStage('Вегетация');
      events.push({ text: `${this.name}: Переход → "Вегетация"`, level: 'info' });
    } else if (this.stage === 'Вегетация' && allOk && this.daysInStage >= Math.round(3 / Math.max(0.5, stageMult))) {
      this.changeStage('Цветение');
      events.push({ text: `${this.name}: Переход → "Цветение"`, level: 'success' });
    }

    this.warnLowHealth(events, ` (нарушены условия)`);
  }
}

/* ---- Пользовательский вид ---- */
class CustomPlant extends Plant {
  constructor(name, speciesKey, def) {
    super(name, speciesKey);
    this.def = def;
  }

  collectDeathReasons(c) {
    const r = [];
    if (c.temp < this.def.tempMin || c.temp > this.def.tempMax)
      r.push(`температура ${c.temp}°C (норма ${this.def.tempMin}–${this.def.tempMax}°C)`);
    if (c.light < this.def.lightMin || c.light > this.def.lightMax)
      r.push(`свет ${c.light}% (норма ${this.def.lightMin}–${this.def.lightMax}%)`);
    if (c.humidity < this.def.humMin || c.humidity > this.def.humMax)
      r.push(`влажность ${c.humidity}% (норма ${this.def.humMin}–${this.def.humMax}%)`);
    return r;
  }

  applyConditions(conditions, events) {
    const { temp, light, humidity } = conditions;
    const nb = this.getNutrientBonus(conditions);
    const stageMult = 1 + nb * 0.2;
    const tempOk  = temp >= this.def.tempMin && temp <= this.def.tempMax;
    const lightOk = light >= this.def.lightMin && light <= this.def.lightMax;
    const humOk   = humidity >= this.def.humMin && humidity <= this.def.humMax;
    const inRange = tempOk && lightOk && humOk;

    if (!tempOk)  this.health -= 1;
    if (!lightOk) this.health -= 1;
    if (!humOk)   this.health -= 1;
    if (inRange)  this.health += 1;

    if (this.stage === 'Семя' && this.daysInStage >= Math.round(3 / Math.max(0.5, stageMult))) {
      this.changeStage('Проросток');
      events.push({ text: `${this.name}: Переход → "Проросток"`, level: 'info' });
    } else if (this.stage === 'Проросток' && this.daysInStage >= Math.round(4 / Math.max(0.5, stageMult))) {
      this.changeStage('Вегетация');
      events.push({ text: `${this.name}: Переход → "Вегетация"`, level: 'info' });
    } else if (this.stage === 'Вегетация' && inRange && this.daysInStage >= Math.round(3 / Math.max(0.5, stageMult))) {
      this.changeStage('Цветение');
      events.push({ text: `${this.name}: Переход → "Цветение"`, level: 'success' });
    }

    this.warnLowHealth(events);
  }
}

/* =======================================================================
   PlantRegistry
   ======================================================================= */
class PlantRegistry {
  constructor() { this.customSpecies = {}; }

  getAvailableSpecies() {
    const builtin = Object.entries(SPECIES_INFO).map(([key, info]) => ({ key, name: info.name, icon: info.icon, builtin: true }));
    const custom  = Object.entries(this.customSpecies).map(([key, def]) => ({ key, name: def.name, icon: def.icon, builtin: false }));
    return [...builtin, ...custom];
  }

  addCustomSpecies(key, def) { this.customSpecies[key] = def; }

  createPlant(speciesKey, name) {
    switch (speciesKey) {
      case 'herbera':  return new Herbera(name);
      case 'yablonya': return new Yablonya(name);
      case 'kaktus':   return new Kaktus(name);
      case 'tomat':    return new Tomat(name);
      case 'orhideya': return new Orhideya(name);
      default:         return new CustomPlant(name, speciesKey, this.customSpecies[speciesKey]);
    }
  }
}

/* =======================================================================
   Greenhouse
   ======================================================================= */
class Greenhouse {
  constructor(plant) {
    this.id = uid();
    this.plant = plant;
    // nutrients — питательность/удобрения, влияет на скорость стадий
    this.conditions = { temp: 22, light: 50, humidity: 50, soil: 50, nutrients: 50 };
    this.history = [];
  }

  updateParam(name, value) { this.conditions[name] = value; }

  recordHistory(day) {
    this.history.push({
      day,
      temp:     this.conditions.temp,
      light:    this.conditions.light,
      humidity: this.conditions.humidity,
      health:   Math.round(this.plant.health),
    });
    if (this.history.length > 5000) this.history.shift();
  }
}

/* =======================================================================
   Journal
   ======================================================================= */
class Journal {
  constructor() { this.entries = []; }
  add(day, text, level = 'info') {
    this.entries.push({ id: uid(), day, text, level });
    if (this.entries.length > 1000) this.entries.shift();
  }
  getAll() { return this.entries; }
  clear()  { this.entries = []; }
}

/* =======================================================================
   Simulation  — НЕ хранит running/speed: они живут в React state
   ======================================================================= */
class Simulation {
  constructor() {
    this.day = 0;
    this.greenhouses = [];
    this.journal = new Journal();
    this.registry = new PlantRegistry();
  }

  addGreenhouse(speciesKey, name) {
    if (this.greenhouses.length >= 20) return null;
    const plant = this.registry.createPlant(speciesKey, name);
    const gh = new Greenhouse(plant);
    this.greenhouses.push(gh);
    this.journal.add(this.day, `Добавлено «${name}» (${plant.stage})`, 'info');
    return gh;
  }

  removeGreenhouse(id) {
    const gh = this.greenhouses.find(g => g.id === id);
    this.greenhouses = this.greenhouses.filter(g => g.id !== id);
    if (gh) this.journal.add(this.day, `Теплица «${gh.plant.name}» удалена`, 'info');
  }

  tick() {
    this.day++;
    this.greenhouses.forEach(gh => {
      if (gh.plant.alive) {
        const events = gh.plant.tick(gh.conditions, this.day);
        events.forEach(e => this.journal.add(this.day, e.text, e.level));
      }
      gh.recordHistory(this.day);
    });
  }
}

/* =======================================================================
   Подсказки для карточки — вычисляются по условиям и виду
   ======================================================================= */
function getTips(plant, conditions) {
  if (!plant.alive) return [];
  const tips = [];
  const { temp, light, humidity, soil, nutrients } = conditions;

  // Питательность
  if (nutrients < 30) tips.push({ icon: '💊', text: 'Мало удобрений — рост замедлен', color: '#c47d24' });
  if (nutrients > 85) tips.push({ icon: '⚠️', text: 'Перебор удобрений может обжечь корни', color: '#c0392b' });

  // Почва
  if (soil < 20)      tips.push({ icon: '🏜️', text: 'Почва слишком сухая — полейте', color: '#c47d24' });
  if (soil > 90)      tips.push({ icon: '💧', text: 'Почва переувлажнена — осушите', color: '#c0392b' });

  switch (plant.species) {
    case 'herbera':
      if (temp < 10)  tips.push({ icon: '🌡️', text: `Слишком холодно (${temp}°C). Поднимите выше 10°C`, color: '#c0392b' });
      if (temp > 35)  tips.push({ icon: '🔥', text: `Слишком жарко (${temp}°C). Снизьте ниже 35°C`, color: '#c0392b' });
      if (light < 20) tips.push({ icon: '💡', text: `Мало света (${light}%). Нужно хотя бы 20%`, color: '#c47d24' });
      if (plant.stage === 'Вегетация') {
        if (temp < 20 || temp > 25) tips.push({ icon: '🌸', text: 'Для цветения нужна темп. 20–25°C', color: '#3d7a4f' });
        if (light <= 70)            tips.push({ icon: '🌸', text: 'Для цветения нужен свет >70%', color: '#3d7a4f' });
      }
      break;

    case 'yablonya':
      if (plant.stage === 'Семя' && !plant.stratified) {
        if (temp >= 5) tips.push({ icon: '❄️', text: `Нужна стратификация! Поставьте темп. <5°C (сейчас ${temp}°C)`, color: '#2d7ea8' });
        else           tips.push({ icon: '❄️', text: `Стратификация идёт (${plant.coldDays}/2 дн.)`, color: '#3d7a4f' });
      }
      if (plant.stage !== 'Семя') {
        if (temp < -10) tips.push({ icon: '🌡️', text: `Мороз (${temp}°C) убивает дерево`, color: '#c0392b' });
        if (temp > 40)  tips.push({ icon: '🔥', text: `Жара (${temp}°C) губительна`, color: '#c0392b' });
        if (light < 10) tips.push({ icon: '💡', text: 'Дереву нужен свет (>10%)', color: '#c47d24' });
      }
      break;

    case 'kaktus':
      if (humidity > 70) tips.push({ icon: '💧', text: `Влажность ${humidity}% — кактус гниёт! Снизьте <70%`, color: '#c0392b' });
      if (temp < 10)     tips.push({ icon: '🌡️', text: `Холодно (${temp}°C). Кактус мёрзнет`, color: '#c0392b' });
      if (light < 30)    tips.push({ icon: '☀️', text: `Мало солнца (${light}%). Кактусу нужно >30%`, color: '#c47d24' });
      if (plant.stage === 'Вегетация') {
        if (temp < 30 || temp > 40)  tips.push({ icon: '🌵', text: 'Для цветения: темп. 30–40°C', color: '#3d7a4f' });
        if (humidity >= 30)          tips.push({ icon: '🌵', text: 'Для цветения: влажность <30%', color: '#3d7a4f' });
      }
      break;

    case 'tomat':
      if (humidity < 30) tips.push({ icon: '💧', text: `Сухо (${humidity}%). Томату нужно >30%`, color: '#c0392b' });
      if (temp < 5)      tips.push({ icon: '🌡️', text: `Холодно (${temp}°C). Норма: 5–40°C`, color: '#c0392b' });
      if (temp > 40)     tips.push({ icon: '🔥', text: `Жарко (${temp}°C). Норма: 5–40°C`, color: '#c0392b' });
      if (light < 20)    tips.push({ icon: '💡', text: `Мало света (${light}%). Нужно >20%`, color: '#c47d24' });
      if (plant.stage === 'Вегетация' || plant.stage === 'Цветение') {
        const goodTemp = temp >= 22 && temp <= 28;
        const goodLight = light > 60;
        const goodHum   = humidity >= 50 && humidity <= 80;
        if (!goodTemp)  tips.push({ icon: '🍅', text: 'Для плодоношения: темп. 22–28°C', color: '#3d7a4f' });
        if (!goodLight) tips.push({ icon: '🍅', text: 'Для плодоношения: свет >60%', color: '#3d7a4f' });
        if (!goodHum)   tips.push({ icon: '🍅', text: 'Для плодоношения: влажность 50–80%', color: '#3d7a4f' });
      }
      break;

    case 'orhideya':
      if (temp < 18 || temp > 25)         tips.push({ icon: '🌡️', text: `Температура ${temp}°C. Норма: 18–25°C`, color: '#c0392b' });
      if (humidity < 60 || humidity > 80) tips.push({ icon: '💧', text: `Влажность ${humidity}%. Норма: 60–80%`, color: '#c0392b' });
      if (light < 40 || light > 60)       tips.push({ icon: '💡', text: `Свет ${light}%. Норма: 40–60%`, color: '#c0392b' });
      break;

    default:
      if (plant.def) {
        if (temp < plant.def.tempMin || temp > plant.def.tempMax)
          tips.push({ icon: '🌡️', text: `Темп. вне нормы (${plant.def.tempMin}–${plant.def.tempMax}°C)`, color: '#c47d24' });
        if (light < plant.def.lightMin || light > plant.def.lightMax)
          tips.push({ icon: '💡', text: `Свет вне нормы (${plant.def.lightMin}–${plant.def.lightMax}%)`, color: '#c47d24' });
        if (humidity < plant.def.humMin || humidity > plant.def.humMax)
          tips.push({ icon: '💧', text: `Влажность вне нормы (${plant.def.humMin}–${plant.def.humMax}%)`, color: '#c47d24' });
      }
  }

  return tips.slice(0, 4); // не больше 4 подсказок одновременно
}

/* =======================================================================
   СТИЛИ
   ======================================================================= */
const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; min-height: 100vh; background: #f5f1eb; }
    #root { width: 100%; }

    .pl-root {
      --bg: #f5f1eb;
      --bg2: #ede8df;
      --panel: #ffffff;
      --panel-soft: #f9f6f1;
      --line: #ddd6ca;
      --line2: #c8bfb0;
      --text: #2c2416;
      --text-dim: #8c7d68;
      --accent: #3d7a4f;
      --accent2: #2f6040;
      --amber: #c47d24;
      --red: #c0392b;
      --red-soft: #fdf0ee;
      --green-soft: #edf7f0;
      --amber-soft: #fdf6ec;
      --grey: #a89b8c;
      font-family: 'Inter', sans-serif;
      background: var(--bg);
      background-image:
        radial-gradient(circle at 85% 10%, rgba(61,122,79,0.06) 0%, transparent 50%),
        radial-gradient(circle at 10% 90%, rgba(196,125,36,0.05) 0%, transparent 40%);
      color: var(--text);
      min-height: 100vh;
      width: 100%;
      padding: 20px 28px;
    }

    /* ---- Шапка ---- */
    .pl-header {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 14px 20px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
      box-shadow: 0 2px 12px rgba(44,36,22,0.06);
    }
    .pl-title {
      font-family: 'Playfair Display', serif;
      font-weight: 700;
      font-size: 21px;
      margin-right: auto;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text);
    }
    .pl-sep { width: 1px; height: 26px; background: var(--line); flex-shrink: 0; }

    /* ---- Кнопки ---- */
    .pl-btn {
      background: var(--panel-soft);
      border: 1.5px solid var(--line2);
      color: var(--text);
      padding: 7px 15px;
      border-radius: 10px;
      font-family: 'Inter', sans-serif;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .pl-btn:hover { background: var(--bg2); border-color: var(--accent); color: var(--accent); }
    .pl-btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    .pl-btn.primary:hover { background: var(--accent2); border-color: var(--accent2); color: #fff; }
    .pl-btn.danger:hover { border-color: var(--red); color: var(--red); background: var(--red-soft); }
    .pl-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* ---- Скорость и дни ---- */
    .pl-speed { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .pl-speed input[type=range] { width: 100px; accent-color: var(--accent); cursor: pointer; }
    .pl-mono {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--accent2);
      background: var(--green-soft);
      border: 1.5px solid #b4dac0;
      padding: 4px 9px;
      border-radius: 8px;
      min-width: 52px;
      text-align: center;
      white-space: nowrap;
    }
    .pl-day { font-size: 13px; color: var(--text-dim); display: flex; align-items: center; gap: 5px; white-space: nowrap; }
    .pl-day b { font-family: 'JetBrains Mono', monospace; color: var(--text); font-size: 15px; }

    /* ---- Layout ---- */
    .pl-layout {
      display: grid;
      grid-template-columns: 1fr 310px;
      gap: 20px;
      align-items: start;
    }
    @media (max-width: 900px) { .pl-layout { grid-template-columns: 1fr; } }

    .pl-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    /* ---- Карточка ---- */
    .pl-card {
      background: var(--panel);
      border: 1.5px solid var(--line);
      border-radius: 20px;
      padding: 16px;
      transition: box-shadow 0.25s, border-color 0.25s;
      box-shadow: 0 2px 8px rgba(44,36,22,0.05);
    }
    .pl-card:hover { box-shadow: 0 4px 20px rgba(44,36,22,0.1); }
    .pl-card.health-good { border-color: #8ecba1; }
    .pl-card.health-mid  { border-color: #e8b96a; }
    .pl-card.health-bad  { border-color: var(--red); box-shadow: 0 0 0 3px rgba(192,57,43,0.1); }
    .pl-card.dead        { border-color: #b8ad9e; filter: grayscale(0.3); opacity: 0.85; }

    .pl-card-top { display: flex; justify-content: space-between; align-items: flex-start; }
    .pl-jar {
      width: 56px; height: 56px;
      border-radius: 14px;
      background: linear-gradient(145deg, #e8f5ec, #d4eddb);
      border: 1.5px solid #b4dac0;
      display: flex; align-items: center; justify-content: center;
      font-size: 28px; flex-shrink: 0;
    }
    .pl-card.dead .pl-jar { background: #f0ece6; border-color: var(--line); }
    .pl-card-name { font-family: 'Playfair Display', serif; font-weight: 600; font-size: 15px; }
    .pl-card-species { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
    .pl-card-stage {
      display: inline-block; margin-top: 5px;
      font-size: 11px; font-weight: 600;
      padding: 2px 9px; border-radius: 20px;
      background: var(--green-soft); border: 1px solid #b4dac0;
      color: var(--accent2);
    }
    .pl-card.dead .pl-card-stage { background: #f0ece6; border-color: var(--line2); color: var(--grey); }
    .pl-del {
      background: none; border: none; color: var(--line2);
      cursor: pointer; font-size: 15px; padding: 4px; border-radius: 6px; transition: 0.15s;
    }
    .pl-del:hover { color: var(--red); background: var(--red-soft); }

    /* ---- Здоровье ---- */
    .pl-health-row { margin: 12px 0 8px; }
    .pl-health-label { display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; color: var(--text-dim); margin-bottom: 4px; }
    .pl-health-bar { height: 9px; background: var(--bg2); border-radius: 6px; overflow: hidden; border: 1px solid var(--line); }
    .pl-health-fill { height: 100%; border-radius: 6px; transition: width 0.4s; }

    /* ---- Баннер смерти ---- */
    .pl-dead-banner {
      margin: 8px 0;
      background: var(--red-soft);
      border: 1.5px solid #e8c0bc;
      border-radius: 10px;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 600;
      color: var(--red);
    }
    .pl-dead-reasons {
      margin-top: 5px;
      font-size: 11px;
      font-weight: 400;
      color: #8a2020;
      line-height: 1.5;
    }
    .pl-dead-reasons li { list-style: none; padding-left: 10px; position: relative; }
    .pl-dead-reasons li::before { content: '•'; position: absolute; left: 0; }

    /* ---- Подсказки ---- */
    .pl-tips { display: flex; flex-direction: column; gap: 4px; margin: 6px 0; }
    .pl-tip {
      display: flex; align-items: flex-start; gap: 5px;
      font-size: 11px; font-weight: 500; line-height: 1.4;
      padding: 4px 8px; border-radius: 7px;
      background: var(--amber-soft); border-left: 3px solid var(--amber);
    }
    .pl-tip.red { background: var(--red-soft); border-left-color: var(--red); }
    .pl-tip.green { background: var(--green-soft); border-left-color: var(--accent); }

    /* ---- Ползунки ---- */
    .pl-sliders { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
    .pl-slider-row { display: grid; grid-template-columns: 68px 1fr 46px; align-items: center; gap: 6px; }
    .pl-slider-label { font-size: 11px; font-weight: 500; color: var(--text-dim); }
    .pl-slider-row input[type=range] { width: 100%; accent-color: var(--accent); cursor: pointer; }
    .pl-slider-val { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text); text-align: right; }
    .pl-nutrients-row { background: #f0f9f3; border-radius: 8px; padding: 5px 6px; border: 1px solid #c2dfc9; }
    .pl-nutrients-row .pl-slider-label { color: var(--accent2); font-weight: 600; }



    /* ---- Дневник ---- */
    .pl-journal {
      background: var(--panel);
      border: 1.5px solid var(--line);
      border-radius: 20px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      max-height: 82vh;
      box-shadow: 0 2px 8px rgba(44,36,22,0.05);
      position: sticky;
      top: 16px;
    }
    .pl-journal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1.5px solid var(--line); }
    .pl-journal-title { font-family: 'Playfair Display', serif; font-weight: 700; font-size: 15px; }
    .pl-journal-list { overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 5px; padding-right: 4px; }
    .pl-journal-list::-webkit-scrollbar { width: 4px; }
    .pl-journal-list::-webkit-scrollbar-thumb { background: var(--line2); border-radius: 4px; }
    .pl-entry { font-size: 11.5px; line-height: 1.5; padding: 6px 9px; border-radius: 9px; border-left: 3px solid var(--line2); background: var(--panel-soft); }
    .pl-entry.info     { background: #f0f7ff; border-left-color: #6fa8c8; }
    .pl-entry.success  { background: var(--green-soft); border-left-color: var(--accent); }
    .pl-entry.warning  { background: var(--amber-soft); border-left-color: var(--amber); }
    .pl-entry.critical { background: var(--red-soft); border-left-color: var(--red); }
    .pl-entry .d { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--text-dim); margin-right: 4px; }
    .pl-empty { color: var(--text-dim); font-size: 12px; text-align: center; padding: 24px 0; }

    /* ---- Модалки ---- */
    .pl-modal-bg {
      position: fixed; inset: 0;
      background: rgba(44,36,22,0.35);
      backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      z-index: 100; padding: 16px;
    }
    .pl-modal {
      background: var(--panel); border: 1.5px solid var(--line);
      border-radius: 20px; padding: 22px;
      width: 100%; max-width: 400px;
      box-shadow: 0 16px 48px rgba(44,36,22,0.18);
      max-height: 90vh; overflow-y: auto;
    }
    .pl-modal h3 { font-family: 'Playfair Display', serif; margin: 0 0 14px; font-size: 18px; }
    .pl-field { margin-bottom: 11px; }
    .pl-field label { display: block; font-size: 11px; font-weight: 600; color: var(--text-dim); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .pl-field input, .pl-field select {
      width: 100%; background: var(--panel-soft); border: 1.5px solid var(--line2);
      color: var(--text); padding: 8px 10px; border-radius: 9px; font-size: 13px;
      font-family: 'Inter', sans-serif; transition: border-color 0.15s;
    }
    .pl-field input:focus, .pl-field select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(61,122,79,0.12); }
    .pl-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .pl-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
  `}</style>
);

/* =======================================================================
   КОМПОНЕНТЫ
   ======================================================================= */

function healthClass(plant) {
  if (!plant.alive)        return 'dead';
  if (plant.health > 70)   return 'health-good';
  if (plant.health >= 30)  return 'health-mid';
  return 'health-bad';
}
function healthColor(plant) {
  if (!plant.alive)       return '#c8bfb0';
  if (plant.health > 70)  return '#3d7a4f';
  if (plant.health >= 30) return '#c47d24';
  return '#c0392b';
}

/* ---- Ползунок ---- */
function ParamSlider({ label, unit, min, max, value, onChange, disabled, isNutrient }) {
  return (
    <div className={`pl-slider-row${isNutrient ? ' pl-nutrients-row' : ''}`}>
      <span className="pl-slider-label">{label}</span>
      <input type="range" min={min} max={max} value={value} disabled={disabled}
        onChange={e => onChange(Number(e.target.value))} />
      <span className="pl-slider-val">{value}{unit}</span>
    </div>
  );
}

/* ---- Карточка теплицы ---- */
function GreenhouseCard({ gh, onUpdateParam, onRemove }) {
  const plant = gh.plant;
  const speciesLabel = SPECIES_INFO[plant.species]
    ? SPECIES_INFO[plant.species].name
    : (plant.def ? plant.def.name : plant.species);

  const tips = getTips(plant, gh.conditions);

  return (
    <div className={`pl-card ${healthClass(plant)}`}>
      {/* Шапка карточки */}
      <div className="pl-card-top">
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="pl-jar">{getStageIcon(plant)}</div>
          <div>
            <div className="pl-card-name">{plant.name}</div>
            <div className="pl-card-species">{speciesLabel}</div>
            <div className="pl-card-stage">{plant.stage}</div>
          </div>
        </div>
        <button className="pl-del" title="Удалить теплицу" onClick={() => onRemove(gh.id)}>✕</button>
      </div>

      {/* Шкала здоровья */}
      <div className="pl-health-row">
        <div className="pl-health-label"><span>Здоровье</span><span>{Math.round(plant.health)}%</span></div>
        <div className="pl-health-bar">
          <div className="pl-health-fill" style={{ width: `${plant.health}%`, background: healthColor(plant) }} />
        </div>
      </div>

      {/* Баннер смерти с причинами */}
      {!plant.alive && (
        <div className="pl-dead-banner">
          ☠️ Растение погибло на день {plant.age}
          {plant.deathCause && plant.deathCause.reasons.length > 0 && (
            <ul className="pl-dead-reasons">
              {plant.deathCause.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Подсказки для живого растения */}
      {plant.alive && tips.length > 0 && (
        <div className="pl-tips">
          {tips.map((t, i) => (
            <div key={i} className={`pl-tip ${t.color === '#c0392b' ? 'red' : t.color === '#3d7a4f' ? 'green' : ''}`}>
              <span>{t.icon}</span><span>{t.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Ползунки */}
      <div className="pl-sliders">
        <ParamSlider label="Темп." unit="°C" min={-15} max={50} value={gh.conditions.temp}
          disabled={!plant.alive} onChange={v => onUpdateParam(gh.id, 'temp', v)} />
        <ParamSlider label="Свет" unit="%" min={0} max={100} value={gh.conditions.light}
          disabled={!plant.alive} onChange={v => onUpdateParam(gh.id, 'light', v)} />
        <ParamSlider label="Влажность" unit="%" min={0} max={100} value={gh.conditions.humidity}
          disabled={!plant.alive} onChange={v => onUpdateParam(gh.id, 'humidity', v)} />
        <ParamSlider label="Почва" unit="%" min={0} max={100} value={gh.conditions.soil}
          disabled={!plant.alive} onChange={v => onUpdateParam(gh.id, 'soil', v)} />
        <ParamSlider label="🌿 Удобр." unit="%" min={0} max={100} value={gh.conditions.nutrients}
          disabled={!plant.alive} onChange={v => onUpdateParam(gh.id, 'nutrients', v)} isNutrient />
      </div>

    </div>
  );
}

/* ---- Дневник ---- */
function JournalPanel({ entries, onClear }) {
  const listRef = useRef(null);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [entries.length]);

  return (
    <div className="pl-journal">
      <div className="pl-journal-head">
        <span className="pl-journal-title">📓 Дневник</span>
        <button className="pl-btn danger" onClick={onClear}>Очистить</button>
      </div>
      <div className="pl-journal-list" ref={listRef}>
        {entries.length === 0 && <div className="pl-empty">Нажмите «Пуск» — и наблюдайте!</div>}
        {entries.map(e => (
          <div key={e.id} className={`pl-entry ${e.level}`}>
            <span className="d">[День {e.day}]</span>{e.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Модалка добавления теплицы ---- */
function AddGreenhouseModal({ speciesList, onCreate, onClose }) {
  const [speciesKey, setSpeciesKey] = useState(speciesList[0]?.key ?? '');
  const [name, setName] = useState('');

  const handleCreate = () => {
    const finalName = name.trim() || (speciesList.find(s => s.key === speciesKey)?.name ?? 'Растение');
    onCreate(speciesKey, finalName);
    onClose();
  };

  return (
    <div className="pl-modal-bg" onClick={onClose}>
      <div className="pl-modal" onClick={e => e.stopPropagation()}>
        <h3>🌱 Новая теплица</h3>
        <div className="pl-field">
          <label>Вид растения</label>
          <select value={speciesKey} onChange={e => setSpeciesKey(e.target.value)}>
            {speciesList.map(s => <option key={s.key} value={s.key}>{s.icon} {s.name}</option>)}
          </select>
        </div>
        <div className="pl-field">
          <label>Имя растения</label>
          <input type="text" placeholder="Например, Моя Орхидея" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="pl-modal-actions">
          <button className="pl-btn" onClick={onClose}>Отмена</button>
          <button className="pl-btn primary" onClick={handleCreate}>Создать</button>
        </div>
      </div>
    </div>
  );
}

/* ---- Модалка создания вида ---- */
function CreateSpeciesModal({ onCreate, onClose }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🌼');
  const [tempMin, setTempMin]   = useState(18);
  const [tempMax, setTempMax]   = useState(28);
  const [lightMin, setLightMin] = useState(40);
  const [lightMax, setLightMax] = useState(80);
  const [humMin, setHumMin]     = useState(40);
  const [humMax, setHumMax]     = useState(70);

  const handleCreate = () => {
    if (!name.trim()) { alert('Введите название вида'); return; }
    if (+tempMin >= +tempMax || +lightMin >= +lightMax || +humMin >= +humMax) {
      alert('Минимум должен быть меньше максимума'); return;
    }
    const key = 'custom_' + Date.now();
    onCreate(key, { name: name.trim(), icon,
      tempMin: +tempMin, tempMax: +tempMax,
      lightMin: +lightMin, lightMax: +lightMax,
      humMin: +humMin, humMax: +humMax });
    onClose();
  };

  return (
    <div className="pl-modal-bg" onClick={onClose}>
      <div className="pl-modal" onClick={e => e.stopPropagation()}>
        <h3>🧪 Создать вид</h3>
        <div className="pl-field-row">
          <div className="pl-field"><label>Название</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Фикус" /></div>
          <div className="pl-field"><label>Эмодзи</label><input value={icon} onChange={e => setIcon(e.target.value)} maxLength={2} /></div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '0 0 8px' }}>Условия для цветения:</p>
        <div className="pl-field-row">
          <div className="pl-field"><label>Темп. мин (°C)</label><input type="number" value={tempMin} onChange={e => setTempMin(e.target.value)} /></div>
          <div className="pl-field"><label>Темп. макс (°C)</label><input type="number" value={tempMax} onChange={e => setTempMax(e.target.value)} /></div>
        </div>
        <div className="pl-field-row">
          <div className="pl-field"><label>Свет мин (%)</label><input type="number" value={lightMin} onChange={e => setLightMin(e.target.value)} /></div>
          <div className="pl-field"><label>Свет макс (%)</label><input type="number" value={lightMax} onChange={e => setLightMax(e.target.value)} /></div>
        </div>
        <div className="pl-field-row">
          <div className="pl-field"><label>Влажн. мин (%)</label><input type="number" value={humMin} onChange={e => setHumMin(e.target.value)} /></div>
          <div className="pl-field"><label>Влажн. макс (%)</label><input type="number" value={humMax} onChange={e => setHumMax(e.target.value)} /></div>
        </div>
        <div className="pl-modal-actions">
          <button className="pl-btn" onClick={onClose}>Отмена</button>
          <button className="pl-btn primary" onClick={handleCreate}>Создать вид</button>
        </div>
      </div>
    </div>
  );
}

/* =======================================================================
   ГЛАВНЫЙ КОМПОНЕНТ
   ======================================================================= */
function createSim() {
  const s = new Simulation();
  s.addGreenhouse('herbera', 'Гербера №1');
  s.addGreenhouse('yablonya', 'Яблоня №1');
  return s;
}

export default function PlantLabApp() {
  const simRef = useRef(null);
  if (!simRef.current) simRef.current = createSim();
  const sim = simRef.current;

  const [running, setRunning] = useState(false);
  const [speed, setSpeed]     = useState(1);

  // ★ ИСПРАВЛЕНИЕ СЧЁТЧИКА ДНЕЙ:
  // day хранится как настоящий React state — только тогда React
  // гарантированно перерисовывает компонент при каждом тике таймера,
  // не дожидаясь пользовательского взаимодействия.
  const [day, setDay] = useState(0);

  // Вспомогательный флаг — сигнализирует, что нужно перерисовать карточки
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion(v => v + 1), []);

  const [showAddModal,     setShowAddModal]     = useState(false);
  const [showSpeciesModal, setShowSpeciesModal] = useState(false);

  // Игровой цикл: 1 тик каждые (1000/speed) мс
  useEffect(() => {
    if (!running) return;
    const ms = Math.max(20, Math.round(1000 / speed));
    const timer = setInterval(() => {
      sim.tick();
      // Обновляем day через настоящий setState — React точно перерисует
      setDay(sim.day);
    }, ms);
    return () => clearInterval(timer);
  }, [running, speed]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = () => setRunning(r => !r);

  const handleReset = () => {
    if (window.confirm('Сбросить симуляцию в начало?')) {
      setRunning(false);
      setSpeed(1);
      simRef.current = createSim();
      setDay(0);
      bump();
    }
  };

  const handleAddGreenhouse = (speciesKey, name) => {
    if (!sim.addGreenhouse(speciesKey, name)) alert('Лимит теплиц: 20 шт.');
    bump();
  };

  const handleRemoveGreenhouse = id => {
    const gh = sim.greenhouses.find(g => g.id === id);
    if (window.confirm(`Удалить теплицу «${gh?.plant.name ?? ''}»?`)) {
      sim.removeGreenhouse(id);
      bump();
    }
  };

  const handleUpdateParam = (id, paramName, value) => {
    const gh = sim.greenhouses.find(g => g.id === id);
    if (gh) gh.updateParam(paramName, value);
    bump();
  };

  const handleClearJournal = () => { sim.journal.clear(); bump(); };
  const handleCreateSpecies = (key, def) => { sim.registry.addCustomSpecies(key, def); bump(); };

  return (
    <div className="pl-root" style={{ width: '100%' }}>
      <Styles />

      {/* ---- Шапка ---- */}
      <div className="pl-header">
        <div className="pl-title">🌿 Лаборатория растений</div>

        <button className="pl-btn primary" onClick={togglePlay}>
          {running ? '⏸ Пауза' : '▶ Пуск'}
        </button>
        <button className="pl-btn" onClick={handleReset}>↺ Сброс</button>

        <div className="pl-sep" />

        <div className="pl-speed">
          <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 500 }}>Скорость</span>
          <input type="range" min={1} max={50} value={speed}
            onChange={e => setSpeed(Number(e.target.value))} />
          <span className="pl-mono">{speed}х</span>
        </div>

        <div className="pl-day">День <b>{day}</b></div>

        <div className="pl-sep" />

        <button className="pl-btn" onClick={() => setShowSpeciesModal(true)}>🧪 Создать вид</button>
        <button className="pl-btn primary" onClick={() => setShowAddModal(true)}>+ Теплица</button>
      </div>

      {/* ---- Основной контент ---- */}
      <div className="pl-layout">
        <div className="pl-grid">
          {sim.greenhouses.length === 0 && (
            <div className="pl-empty" style={{ padding: 40 }}>Нет теплиц. Нажмите «+ Теплица»!</div>
          )}
          {sim.greenhouses.map(gh => (
            <GreenhouseCard key={gh.id} gh={gh}
              onUpdateParam={handleUpdateParam}
              onRemove={handleRemoveGreenhouse} />
          ))}
        </div>

        <JournalPanel entries={sim.journal.getAll()} onClear={handleClearJournal} />
      </div>

      {showAddModal && (
        <AddGreenhouseModal speciesList={sim.registry.getAvailableSpecies()}
          onCreate={handleAddGreenhouse} onClose={() => setShowAddModal(false)} />
      )}
      {showSpeciesModal && (
        <CreateSpeciesModal onCreate={handleCreateSpecies} onClose={() => setShowSpeciesModal(false)} />
      )}
    </div>
  );
}
