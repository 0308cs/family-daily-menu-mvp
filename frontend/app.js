const APP_VERSION = "20260703-4";
const DATA_URL = `../data/recipes.seed.json?v=${APP_VERSION}`;

const STORAGE_KEYS = {
  plan: "fdm.plan.v2",
  members: "fdm.members.v2",
  checked: "fdm.checked.v2",
  corrections: "fdm.corrections.v1",
  ingredientReplacements: "fdm.ingredientReplacements.v2",
  history: "fdm.history.v1",
  pantry: "fdm.pantry.v1",
  reimbursements: "fdm.reimbursements.v1",
};

const DEFAULT_MEMBERS = [
  { id: "member1", name: "成员1", factor: 1, ageGroup: "adult", hardAvoid: [] },
  { id: "member2", name: "成员2", factor: 1, ageGroup: "adult", hardAvoid: [] },
  { id: "member3", name: "成员3", factor: 0.5, ageGroup: "adult_like", hardAvoid: [] },
  { id: "member4", name: "成员4", factor: 1, ageGroup: "adult_like", hardAvoid: [] },
  { id: "member5", name: "成员5", factor: 0.5, ageGroup: "young_child", hardAvoid: [] },
  { id: "helper", name: "帮厨", factor: 1, ageGroup: "adult", hardAvoid: [] },
];

const GLOBAL_HARD_AVOID = [];

const MEALS = [
  { id: "lunch", label: "午餐" },
  { id: "dinner", label: "晚餐" },
];

const FILTERS = [
  { id: "all", label: "全部" },
  { id: "main", label: "荤菜" },
  { id: "vegetable", label: "蔬菜" },
  { id: "tofu", label: "豆腐" },
  { id: "soup", label: "汤羹" },
];

const PURCHASE_ORDER = ["蔬菜", "肉蛋水产", "豆制品", "主食", "其他"];
const SHOPPING_DISPLAY_ORDER = [...PURCHASE_ORDER, "家里有"];

const PANTRY_UNITS = ["克", "斤", "两", "个", "只", "棵", "根", "块", "盒", "袋"];
const COMMON_PANTRY_ITEMS = [
  { name: "鸡蛋", amount: 6, unit: "个" },
  { name: "豆腐", amount: 1, unit: "块" },
  { name: "土豆", amount: 2, unit: "个" },
  { name: "番茄", amount: 2, unit: "个" },
  { name: "冬瓜", amount: 1, unit: "块" },
  { name: "菜心", amount: 1, unit: "斤" },
  { name: "猪排骨", amount: 1, unit: "斤" },
  { name: "鸡腿肉", amount: 1, unit: "斤" },
];

const state = {
  payload: null,
  recipes: [],
  activeTab: "plan",
  meals: {
    lunch: [],
    dinner: [],
  },
  members: migrateDefaultMembers(loadJson(STORAGE_KEYS.members, DEFAULT_MEMBERS)),
  plan: loadJson(STORAGE_KEYS.plan, null),
  checked: loadJson(STORAGE_KEYS.checked, {}),
  corrections: loadJson(STORAGE_KEYS.corrections, {}),
  ingredientReplacements: loadJson(STORAGE_KEYS.ingredientReplacements, {}),
  history: pruneHistory(loadJson(STORAGE_KEYS.history, [])),
  pantry: normalizePantryList(loadJson(STORAGE_KEYS.pantry, [])),
  reimbursements: normalizeReimbursements(loadJson(STORAGE_KEYS.reimbursements, [])),
  reimbursementDraftImage: null,
  recipeFilter: "all",
  recipeSearch: "",
  reviewOnly: false,
  generationCount: 0,
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  bindEvents();
  renderTomorrowTitle();
  renderMealPicker();
  renderEmptyStates();
  renderHistory();

  try {
    const response = await fetch(DATA_URL);
    state.payload = await response.json();
    state.recipes = applyCorrections(state.payload.recipes || [])
      .filter((recipe) => !violatesHardAvoid(recipe, GLOBAL_HARD_AVOID));
    els.recipeCount.textContent = state.recipes.length;
    renderRecipeFilters();
    renderRecipeList();
    if (state.plan) {
      state.plan = hydratePlan(state.plan);
      if (planViolatesGlobalAvoid(state.plan)) {
        state.plan = null;
        state.checked = {};
        saveJson(STORAGE_KEYS.plan, state.plan);
        saveJson(STORAGE_KEYS.checked, state.checked);
        renderEmptyStates();
        showToast("已清除含鸭肉的旧菜单，请重新生成。");
      } else {
        renderPlan();
        renderShopping();
      }
    }
  } catch (error) {
    showToast("菜谱数据读取失败，请确认已从项目根目录启动本地服务。");
    console.error(error);
  }
}

function cacheElements() {
  [
    "tomorrowTitle",
    "recipeCount",
    "mealPicker",
    "generateBtn",
    "regenerateBtn",
    "copyLunchBtn",
    "settingsBtn",
    "addGuestBtn",
    "clearGuestsBtn",
    "planOutput",
    "historyOutput",
    "shoppingTitle",
    "shoppingOutput",
    "pantryBtn",
    "reimburseBtn",
    "copyShoppingBtn",
    "recipeFilters",
    "recipeSearch",
    "recipeList",
    "reviewOnlyBtn",
    "recipeDrawer",
    "drawerBody",
    "replaceSheet",
    "replaceBody",
    "settingsDrawer",
    "settingsBody",
    "pantryDrawer",
    "pantryBody",
    "reimburseDrawer",
    "reimburseBody",
    "toast",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  els.generateBtn.addEventListener("click", () => generatePlan(false));
  els.regenerateBtn.addEventListener("click", () => generatePlan(true));
  els.copyLunchBtn.addEventListener("click", copyLunchToDinner);
  els.settingsBtn.addEventListener("click", openSettingsDrawer);
  els.addGuestBtn.addEventListener("click", addGuest);
  els.clearGuestsBtn.addEventListener("click", clearGuests);
  els.pantryBtn.addEventListener("click", openPantryDrawer);
  els.reimburseBtn.addEventListener("click", openReimburseDrawer);
  els.copyShoppingBtn.addEventListener("click", copyShoppingList);
  els.recipeSearch.addEventListener("input", (event) => {
    state.recipeSearch = event.target.value.trim();
    renderRecipeList();
  });
  els.recipeSearch.addEventListener("search", (event) => {
    state.recipeSearch = event.target.value.trim();
    renderRecipeList();
  });
  els.reviewOnlyBtn.addEventListener("click", () => {
    state.reviewOnly = !state.reviewOnly;
    els.reviewOnlyBtn.setAttribute("aria-pressed", String(state.reviewOnly));
    els.reviewOnlyBtn.classList.toggle("is-active", state.reviewOnly);
    renderRecipeList();
  });

  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });
  document.querySelectorAll("[data-close-drawer]").forEach((node) => {
    node.addEventListener("click", closeRecipeDrawer);
  });
  document.querySelectorAll("[data-close-replace]").forEach((node) => {
    node.addEventListener("click", closeReplaceSheet);
  });
  document.querySelectorAll("[data-close-settings]").forEach((node) => {
    node.addEventListener("click", closeSettingsDrawer);
  });
  document.querySelectorAll("[data-close-pantry]").forEach((node) => {
    node.addEventListener("click", closePantryDrawer);
  });
  document.querySelectorAll("[data-close-reimburse]").forEach((node) => {
    node.addEventListener("click", closeReimburseDrawer);
  });
}

function renderTomorrowTitle() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const title = `${date.getMonth() + 1}月${date.getDate()}日明日菜单`;
  els.tomorrowTitle.textContent = title;
}

function renderMealPicker() {
  els.mealPicker.innerHTML = MEALS.map((meal) => {
    const selected = state.meals[meal.id] || [];
    const factor = totalFactor(selected);
    const memberButtons = state.members
      .map((member) => {
        const active = selected.includes(member.id);
        return `
          <button class="member-pill ${active ? "is-selected" : ""}" type="button" data-meal="${meal.id}" data-member="${member.id}">
            ${escapeHtml(member.name)}
          </button>
        `;
      })
      .join("");
    return `
      <section class="meal-block">
        <div class="meal-heading">
          <strong>${meal.label}</strong>
          <span>${selected.length} 人 / 饭量 ${formatFactor(factor)}</span>
        </div>
        <div class="member-grid">${memberButtons}</div>
      </section>
    `;
  }).join("");

  els.mealPicker.querySelectorAll(".member-pill").forEach((button) => {
    button.addEventListener("click", () => toggleMealMember(button.dataset.meal, button.dataset.member));
  });
}

function toggleMealMember(mealId, memberId) {
  const selected = new Set(state.meals[mealId] || []);
  if (selected.has(memberId)) {
    selected.delete(memberId);
  } else {
    selected.add(memberId);
  }
  state.meals[mealId] = [...selected];
  renderMealPicker();
}

function copyLunchToDinner() {
  state.meals.dinner = [...(state.meals.lunch || [])];
  renderMealPicker();
  showToast("晚餐人数已同步。");
}

function addGuest() {
  const guestNumber = state.members.filter((member) => member.id.startsWith("guest")).length + 1;
  const guest = { id: `guest-${Date.now()}`, name: `客人${guestNumber}`, factor: 1 };
  state.members.push(guest);
  MEALS.forEach((meal) => {
    state.meals[meal.id] = [...new Set([...(state.meals[meal.id] || []), guest.id])];
  });
  saveJson(STORAGE_KEYS.members, state.members);
  renderMealPicker();
}

function clearGuests() {
  state.members = state.members.filter((member) => !member.id.startsWith("guest"));
  MEALS.forEach((meal) => {
    state.meals[meal.id] = (state.meals[meal.id] || []).filter((id) => !id.startsWith("guest"));
  });
  saveJson(STORAGE_KEYS.members, state.members);
  renderMealPicker();
}

function renderEmptyStates() {
  if (!state.plan) {
    els.planOutput.innerHTML = `<div class="plan-empty">选择午餐、晚餐吃饭的人后生成菜单。</div>`;
    els.shoppingOutput.innerHTML = `<div class="shopping-empty">生成菜单后自动汇总采购清单。</div>`;
  }
}

function generatePlan(forceNew) {
  if (!state.recipes.length) {
    showToast("菜谱还没加载完成。");
    return;
  }
  if (!MEALS.some((meal) => (state.meals[meal.id] || []).length)) {
    showToast("请先选择午餐或晚餐用餐人。");
    return;
  }
  if (forceNew) {
    state.generationCount += 1;
  }

  const usedRecipeIds = new Set();
  const usedProtein = new Set();
  const recentIds = recentRecipeIds();
  const meals = MEALS.map((meal) => {
    const memberIds = state.meals[meal.id] || [];
    const factor = totalFactor(memberIds);
    if (!memberIds.length) {
      return null;
    }
    const rules = mealRules(memberIds);
    const dishes = chooseDishesForMeal(meal.id, factor, memberIds, rules, recentIds, usedRecipeIds, usedProtein);
    dishes.forEach((dish) => {
      usedRecipeIds.add(dish.recipe.id);
      usedProtein.add(dish.recipe.protein_group);
    });
    return {
      id: meal.id,
      label: meal.label,
      memberIds,
      members: memberIds.map(memberName).filter(Boolean),
      factor,
      alerts: rules.alerts,
      dishes,
    };
  }).filter(Boolean);

  state.plan = {
    id: `plan-${Date.now()}`,
    date: tomorrowIsoDate(),
    generatedAt: new Date().toISOString(),
    meals,
    nutrition: buildNutritionSummary(meals),
  };
  state.checked = {};
  saveJson(STORAGE_KEYS.plan, serializablePlan(state.plan));
  saveJson(STORAGE_KEYS.checked, state.checked);
  renderPlan();
  renderShopping();
  renderHistory();
  showToast("明日菜单已生成。");
}

function chooseDishesForMeal(mealId, factor, memberIds, rules, recentIds, usedRecipeIds, usedProtein) {
  const target = factor <= 4 ? 3 : 4;
  const slots = target <= 3 ? ["main", "vegetable", "support"] : ["main", "second", "vegetable", "soup"];
  const dishes = [];

  slots.forEach((slot, index) => {
    const recipe = pickRecipe(slot, mealId, index, memberIds, rules, recentIds, usedRecipeIds, usedProtein, dishes);
    if (recipe) {
      dishes.push({
        recipe,
        servings: Math.max(2, Math.round(factor)),
        reason: reasonForRecipe(recipe, slot),
      });
      usedRecipeIds.add(recipe.id);
      if (recipe.protein_group) usedProtein.add(recipe.protein_group);
    }
  });

  return dishes;
}

function pickRecipe(slot, mealId, index, memberIds, rules, recentIds, usedRecipeIds, usedProtein, currentDishes) {
  const baseCandidates = state.recipes.filter((recipe) => {
    if (usedRecipeIds.has(recipe.id)) return false;
    if (currentDishes.some((dish) => dish.recipe.id === recipe.id)) return false;
    if (violatesHardAvoid(recipe, rules.hardAvoid)) return false;
    if (recipe.tags?.warnings?.length > 1) return false;
    return true;
  });
  const slotCandidates = baseCandidates.filter((recipe) => {
    if (slot === "vegetable") return recipe.dish_type === "vegetable";
    if (slot === "soup") return recipe.dish_type === "soup";
    if (slot === "support") return ["tofu", "egg", "soup", "vegetable"].includes(recipe.dish_type);
    if (slot === "second") return ["main", "tofu", "egg"].includes(recipe.dish_type);
    return recipe.dish_type === "main";
  });

  const relaxedCandidates = slotCandidates.length ? slotCandidates : baseCandidates;
  const salt = `${tomorrowIsoDate()}-${mealId}-${slot}-${index}-${state.generationCount}`;
  const currentIngredientKeys = new Set(currentDishes.map((dish) => recipeMainIngredientKey(dish.recipe)).filter(Boolean));
  const currentProteins = new Set(currentDishes.map((dish) => dish.recipe.protein_group).filter(Boolean));
  return relaxedCandidates
    .map((recipe) => {
      let score = recipe.selection_score || 0;
      const ingredientKey = recipeMainIngredientKey(recipe);
      if (ingredientKey && currentIngredientKeys.has(ingredientKey)) score -= 120;
      if (recipe.protein_group && currentProteins.has(recipe.protein_group)) score -= 14;
      if (!usedProtein.has(recipe.protein_group)) score += 5;
      if (recipe.method === "炸") score -= 10;
      if (recipe.tags?.warnings?.length) score -= recipe.tags.warnings.length * 5;
      if (recentIds.has(String(recipe.id))) score -= 45;
      score += memberFitScore(recipe, memberIds, rules);
      score += seededNumber(`${salt}-${recipe.id}`) * 8;
      return { recipe, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.recipe;
}

function reasonForRecipe(recipe, slot) {
  if (slot === "vegetable") return "补蔬菜，采购容易";
  if (slot === "soup") return "汤羹补水分，做法稳";
  if (recipe.protein_group === "fish" || recipe.protein_group === "seafood") return "水产蛋白，适合午晚餐轮换";
  if (recipe.protein_group === "tofu") return "豆制品补位，口味清淡";
  if (recipe.method.includes("蒸")) return "蒸菜少油，保姆容易执行";
  return "家常食材，适合明天安排";
}

function recipeMainIngredientKey(recipe) {
  const text = [
    recipe.name,
    ...(recipe.ingredients || [])
      .filter((item) => !item.is_condiment)
      .map((item) => item.name),
  ].join(" ");
  const rules = [
    ["pork_ribs", /排骨|猪小排|小排/],
    ["fish", /鲈鱼|鲫鱼|鲳鱼|草鱼|鱼片|鱼头|鱼$/],
    ["shrimp", /虾|虾仁|河虾/],
    ["squid", /鱿鱼|墨鱼/],
    ["chicken", /鸡(?!蛋|精)|鸡腿|鸡翅|鸡胸|鸡肉|鸡块|嫩鸡|土鸡|母鸡|乌鸡|鸡汤/],
    ["duck", /鸭|板鸭|烧鸭/],
    ["beef", /牛肉|牛腩|牛柳|肥牛/],
    ["pork", /猪肉|瘦肉|五花肉|肉末|肉片|里脊/],
    ["tofu", /豆腐|油豆腐|嫩豆腐|老豆腐|豆干|腐竹/],
    ["egg", /鸡蛋|鸭蛋|蛋皮|蛋$/],
  ];
  return rules.find(([, pattern]) => pattern.test(text))?.[0] || null;
}

function mealRules(memberIds) {
  const members = selectedMembers(memberIds);
  const hardAvoid = unique([...GLOBAL_HARD_AVOID, ...members.flatMap((member) => member.hardAvoid || [])]);
  const softAvoidMembers = members.filter((member) => (member.softAvoid || []).includes("明显葱花"));
  const hasYoungChild = members.some((member) => member.ageGroup === "young_child");
  const alerts = [];

  if (hardAvoid.includes("鸭肉")) {
    alerts.push("已避开成员忌口食材");
  }
  if (hardAvoid.includes("油麦菜")) {
    alerts.push("已避开成员忌口食材");
  }
  if (hardAvoid.includes("笋") || hardAvoid.includes("豇豆") || hardAvoid.includes("通心菜")) {
    alerts.push("已避开成员忌口食材");
  }
  if (softAvoidMembers.length) {
    alerts.push(`${softAvoidMembers.map((member) => member.name).join("、")}不吃明显葱花，少放或挑出`);
  }
  if (hasYoungChild) {
    alerts.push("儿童用餐：少辣，鱼刺留意");
  }

  return { hardAvoid, hasYoungChild, alerts };
}

function selectedMembers(memberIds) {
  return memberIds
    .map((id) => state.members.find((member) => member.id === id))
    .filter(Boolean);
}

function planViolatesGlobalAvoid(plan) {
  return (plan?.meals || []).some((meal) => (
    meal.dishes || []
  ).some((dish) => violatesHardAvoid(dish.recipe, GLOBAL_HARD_AVOID)));
}

function memberFitScore(recipe, memberIds, rules) {
  let score = 0;
  if (rules.hasYoungChild) {
    const text = recipeSearchText(recipe);
    if (/麻辣|香辣|酸辣|剁椒|泡椒|辣子|辣椒|辛辣/.test(text)) score -= 18;
    if (/炸|油炸|干煸/.test(text) || recipe.method === "炸") score -= 12;
    if (/坚果|花生|腰果/.test(text)) score -= 6;
    if (recipe.protein_group === "fish") score -= 3;
    if (recipe.method === "蒸" || recipe.method === "炖" || recipe.method === "煮") score += 4;
  }
  if (memberIds.some((id) => id === "nainai") && recipe.method === "炖") score += 2;
  return score;
}

function violatesHardAvoid(recipe, hardAvoid) {
  return textIncludesAvoid(recipeSearchText(recipe), hardAvoid);
}

function textIncludesAvoid(text, hardAvoid) {
  if (!hardAvoid?.length) return false;
  return hardAvoid.some((token) => {
    if (token === "鸭肉" || token === "鸭子" || token === "鸭") return /鸭(?!蛋)|板鸭|烧鸭|鸭肉|鸭块|鸭腿|鸭翅|鸭掌|鸭架|鸭血|老鸭|烤鸭|煲鸭/.test(text);
    if (token === "笋") return /笋/.test(text);
    if (token === "通心菜") return /通心菜|空心菜|蕹菜/.test(text);
    if (token === "豇豆") return /豇豆|长豆角/.test(text);
    return text.includes(token);
  });
}

function recipeSearchText(recipe) {
  return [
    recipe.name,
    recipe.method,
    recipe.dish_type,
    recipe.tags?.taste,
    ...(recipe.tags?.warnings || []),
    ...(recipe.ingredients || []).map((item) => item.name),
  ].join(" ");
}

function buildNutritionSummary(meals) {
  const dishes = meals.flatMap((meal) => meal.dishes.map((dish) => dish.recipe));
  const hasVegEveryMeal = meals.every((meal) => meal.dishes.some((dish) => {
    const groups = dish.recipe.tags?.food_groups || [];
    return dish.recipe.dish_type === "vegetable" || groups.some((group) => group.includes("蔬菜"));
  }));
  const proteins = new Set(dishes.map((recipe) => recipe.protein_group).filter(Boolean));
  const methods = new Set(dishes.map((recipe) => recipe.method).filter(Boolean));
  const lowRisk = dishes.every((recipe) => !(recipe.tags?.warnings || []).includes("炸"));
  return {
    score: Math.min(98, 70 + (hasVegEveryMeal ? 10 : 0) + Math.min(proteins.size * 4, 12) + Math.min(methods.size * 2, 6)),
    lines: [
      hasVegEveryMeal ? "每餐已有蔬菜" : "有餐次蔬菜偏少",
      `蛋白来源 ${proteins.size || 0} 类`,
      `烹饪方式 ${methods.size || 0} 种`,
      lowRisk ? "默认少炸少辣" : "含偏重口味菜",
    ],
  };
}

function renderPlan() {
  if (!state.plan?.meals?.length) {
    renderEmptyStates();
    return;
  }

  const nutrition = state.plan.nutrition || buildNutritionSummary(state.plan.meals);
  els.planOutput.innerHTML = `
    <section class="nutrition-strip">
      <strong>搭配分 ${nutrition.score}</strong>
      <div class="nutrition-row">${nutrition.lines.map(escapeHtml).join(" · ")}</div>
    </section>
    <div class="plan-actions">
      <button class="primary-button compact" type="button" data-confirm-plan>确认明天就做</button>
      <button class="inline-button" type="button" data-regenerate-plan>换一套</button>
    </div>
    ${state.plan.meals.map(renderMealPlan).join("")}
  `;

  const confirmButton = els.planOutput.querySelector("[data-confirm-plan]");
  if (confirmButton) {
    confirmButton.addEventListener("click", savePlanToHistory);
  }
  const regenerateButton = els.planOutput.querySelector("[data-regenerate-plan]");
  if (regenerateButton) {
    regenerateButton.addEventListener("click", () => generatePlan(true));
  }
  els.planOutput.querySelectorAll("[data-open-recipe]").forEach((button) => {
    button.addEventListener("click", () => openRecipeDrawer(button.dataset.openRecipe));
  });
  els.planOutput.querySelectorAll("[data-replace-dish]").forEach((button) => {
    button.addEventListener("click", () => openDishReplace(button.dataset.mealId, button.dataset.replaceDish));
  });
}

function renderMealPlan(meal) {
  const alertLine = meal.alerts?.length
    ? `<p class="meal-alert">${meal.alerts.map(escapeHtml).join("；")}</p>`
    : "";
  return `
    <section class="meal-plan">
      <div class="meal-plan-header">
        <div>
          <h3>${meal.label}</h3>
          <p>${meal.members.map(escapeHtml).join("、")} · ${meal.dishes.length} 道菜</p>
          ${alertLine}
        </div>
        <span class="tag green">饭量 ${formatFactor(meal.factor)}</span>
      </div>
      <div class="dish-list">
        ${meal.dishes.map((dish) => renderDishCard(meal.id, dish)).join("")}
      </div>
    </section>
  `;
}

function renderDishCard(mealId, dish) {
  const recipe = dish.recipe;
  const tags = [
    recipe.method,
    dishTypeLabel(recipe.dish_type),
    `${recipe.time_minutes || 30} 分钟`,
  ].filter(Boolean);
  return `
    <article class="dish-card">
      <img class="dish-image" src="${assetUrl(recipe.image_path)}" alt="${escapeHtml(recipe.name)}" loading="lazy" />
      <div class="dish-content">
        <div>
          <div class="dish-title-line">
            <h4>${escapeHtml(recipe.name)}</h4>
          </div>
          <div class="dish-meta">${escapeHtml(dish.reason || reasonForRecipe(recipe, recipe.dish_type))}</div>
        </div>
        <div class="tag-row">${tags.map((tag) => `<span class="tag blue">${escapeHtml(tag)}</span>`).join("")}</div>
        <div class="dish-actions">
          <button class="dish-action" type="button" data-open-recipe="${recipe.id}">做法</button>
          <button class="dish-action" type="button" data-meal-id="${mealId}" data-replace-dish="${recipe.id}">换一道</button>
        </div>
      </div>
    </article>
  `;
}

function savePlanToHistory() {
  if (!state.plan?.meals?.length) {
    showToast("还没有可确认的菜单。");
    return;
  }
  const recipeIds = state.plan.meals.flatMap((meal) => meal.dishes.map((dish) => String(dish.recipe.id)));
  const recipeNames = state.plan.meals.flatMap((meal) => meal.dishes.map((dish) => dish.recipe.name));
  const entry = {
    id: state.plan.id,
    date: state.plan.date,
    savedAt: new Date().toISOString(),
    recipeIds,
    recipeNames,
    meals: state.plan.meals.map((meal) => ({
      label: meal.label,
      members: meal.members,
      dishes: meal.dishes.map((dish) => dish.recipe.name),
    })),
  };
  state.history = pruneHistory([entry, ...state.history.filter((item) => item.date !== entry.date)]);
  saveJson(STORAGE_KEYS.history, state.history);
  renderHistory();
  showToast("已确认，后续生成会避开这些菜。");
}

function renderHistory() {
  if (!els.historyOutput) return;
  const history = pruneHistory(state.history || []);
  state.history = history;
  if (!history.length) {
    els.historyOutput.innerHTML = "";
    return;
  }
  els.historyOutput.innerHTML = `
    <section class="history-card">
      <div class="history-header">
        <div>
          <p class="eyebrow">近 7 天历史</p>
          <h3>下次生成会避开这些菜</h3>
        </div>
        <button class="inline-button" type="button" data-clear-history>清空</button>
      </div>
      <div class="history-list">
        ${history.slice(0, 5).map((entry) => `
          <article class="history-entry">
            <strong>${escapeHtml(formatHistoryDate(entry.date))}</strong>
            <span>${escapeHtml(entry.recipeNames.slice(0, 6).join("、"))}${entry.recipeNames.length > 6 ? "…" : ""}</span>
          </article>
        `).join("")}
      </div>
    </section>
  `;
  const clearButton = els.historyOutput.querySelector("[data-clear-history]");
  if (clearButton) {
    clearButton.addEventListener("click", clearHistory);
  }
}

function clearHistory() {
  state.history = [];
  saveJson(STORAGE_KEYS.history, state.history);
  renderHistory();
  showToast("近 7 天历史已清空。");
}

function recentRecipeIds() {
  const ids = new Set();
  pruneHistory(state.history || []).forEach((entry) => {
    (entry.recipeIds || []).forEach((id) => ids.add(String(id)));
  });
  return ids;
}

function pruneHistory(history) {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 7);
  return (history || [])
    .filter((entry) => entry?.date)
    .filter((entry) => new Date(`${entry.date}T00:00:00`) >= cutoff)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 14);
}

function formatHistoryDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function buildShoppingItems() {
  if (!state.plan?.meals?.length) return [];
  const merged = new Map();
  state.plan.meals.forEach((meal) => {
    meal.dishes.forEach((dish) => {
      const recipe = dish.recipe;
      const scale = meal.factor / Math.max(recipe.base_servings || 3, 1);
      recipe.ingredients.forEach((ingredient) => {
        if (!shouldShop(ingredient)) return;
        const originalName = ingredient.name;
        const replacement = state.ingredientReplacements[originalName];
        const name = replacement || originalName;
        const key = normalizeIngredientKey(name);
        const amountG = ingredient.amount_g ? ingredient.amount_g * scale : null;
        const amount = ingredient.amount ? ingredient.amount * scale : null;
        const group = purchaseGroupForName(name, ingredient.purchase_group);
        if (!merged.has(key)) {
          merged.set(key, {
            key,
            name,
            originalNames: new Set(),
            group,
            amountG: 0,
            amountOther: 0,
            unit: ingredient.unit,
            recipes: new Set(),
            replacedFrom: replacement ? new Set([originalName]) : new Set(),
          });
        }
        const item = merged.get(key);
        item.originalNames.add(originalName);
        item.group = group;
        item.recipes.add(recipe.name);
        if (replacement) item.replacedFrom.add(originalName);
        if (amountG) item.amountG += amountG;
        else if (amount) item.amountOther += amount;
      });
    });
  });

  const rawItems = [...merged.values()].map((item) => ({
    ...item,
    originalNames: [...item.originalNames],
    recipes: [...item.recipes],
    replacedFrom: [...item.replacedFrom],
  }));

  return applyPantryToShoppingItems(rawItems).sort((a, b) => {
    const groupDelta = SHOPPING_DISPLAY_ORDER.indexOf(a.displayGroup) - SHOPPING_DISPLAY_ORDER.indexOf(b.displayGroup);
    if (groupDelta !== 0) return groupDelta;
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });
}

function applyPantryToShoppingItems(items) {
  const stockByKey = buildPantryIndex();
  return items.map((item) => {
    const stock = stockByKey.get(item.key);
    const amountG = item.amountG || 0;
    const amountOther = item.amountOther || 0;
    const pantryDeductedG = stock?.amountG ? Math.min(amountG, stock.amountG) : 0;
    const pantryDeductedOther = !amountG && stock?.amountOther ? Math.min(amountOther, stock.amountOther) : 0;
    const neededAmountG = Math.max(0, amountG - pantryDeductedG);
    const neededAmountOther = Math.max(0, amountOther - pantryDeductedOther);
    const coveredByPantry = amountG > 0
      ? neededAmountG <= 1
      : amountOther > 0 && neededAmountOther <= 0.001;
    const next = {
      ...item,
      pantryDeductedG,
      pantryDeductedOther,
      neededAmountG,
      neededAmountOther,
      coveredByPantry,
      displayGroup: coveredByPantry ? "家里有" : item.group,
    };
    next.displayAmount = displayShoppingAmount(next);
    next.pantryNote = displayPantryDeduction(next);
    return next;
  });
}

function buildPantryIndex() {
  const index = new Map();
  state.pantry.forEach((entry) => {
    const key = normalizeIngredientKey(entry.name);
    if (!key) return;
    const current = index.get(key) || { amountG: 0, amountOther: 0 };
    current.amountG += Number(entry.amountG || 0);
    current.amountOther += Number(entry.amountOther || 0);
    index.set(key, current);
  });
  return index;
}

function renderShopping() {
  const items = buildShoppingItems();
  const buyCount = items.filter((item) => !item.coveredByPantry).length;
  const coveredCount = items.length - buyCount;
  els.shoppingTitle.textContent = items.length
    ? `${buyCount} 项需买${coveredCount ? `，${coveredCount} 项家里有` : ""}`
    : "还没有生成菜单";
  if (!items.length) {
    els.shoppingOutput.innerHTML = `<div class="shopping-empty">生成菜单后自动汇总采购清单。</div>`;
    return;
  }

  const groups = groupBy(items, (item) => item.displayGroup);
  els.shoppingOutput.innerHTML = SHOPPING_DISPLAY_ORDER.filter((group) => groups[group]?.length)
    .map((group) => `
      <section class="shopping-group">
        <h3>${group}</h3>
        ${groups[group].map(renderShoppingItem).join("")}
      </section>
    `).join("");

  els.shoppingOutput.querySelectorAll("[data-check-item]").forEach((button) => {
    button.addEventListener("click", () => toggleShoppingCheck(button.dataset.checkItem));
  });
  els.shoppingOutput.querySelectorAll("[data-replace-ingredient]").forEach((button) => {
    button.addEventListener("click", () => openIngredientReplace(button.dataset.replaceIngredient));
  });
  els.shoppingOutput.querySelectorAll("[data-mark-pantry]").forEach((button) => {
    button.addEventListener("click", () => addPantryFromShopping(button.dataset.markPantry));
  });
}

function renderShoppingItem(item) {
  const checked = Boolean(state.checked[item.key]);
  const noteParts = [];
  if (item.replacedFrom.length) noteParts.push(`已替换：${item.replacedFrom.join("、")}`);
  noteParts.push(`用于 ${item.recipes.slice(0, 2).join("、")}`);
  if (item.pantryNote) {
    noteParts.push(item.coveredByPantry ? `家里已有：${item.pantryNote}` : `已扣库存：${item.pantryNote}`);
  }
  const note = noteParts.join("；");
  return `
    <div class="shopping-item ${checked ? "is-checked" : ""} ${item.coveredByPantry ? "is-covered" : ""}">
      <button class="check-button" type="button" aria-label="勾选 ${escapeHtml(item.name)}" data-check-item="${escapeAttribute(item.key)}" ${item.coveredByPantry ? "disabled" : ""}></button>
      <div class="shopping-main">
        <strong>${escapeHtml(item.name)} ${escapeHtml(item.displayAmount)}</strong>
        <span>${escapeHtml(note)}</span>
      </div>
      <div class="shopping-actions">
        ${item.coveredByPantry ? "" : `<button class="stock-button" type="button" data-mark-pantry="${escapeAttribute(item.key)}">有</button>`}
        <button class="replace-button" type="button" data-replace-ingredient="${escapeAttribute(item.name)}">换</button>
      </div>
    </div>
  `;
}

function toggleShoppingCheck(key) {
  state.checked[key] = !state.checked[key];
  saveJson(STORAGE_KEYS.checked, state.checked);
  renderShopping();
}

function copyShoppingList() {
  const items = buildShoppingItems().filter((item) => !item.coveredByPantry);
  if (!items.length) {
    showToast("库存已覆盖采购清单，暂无需购买。");
    return;
  }
  const text = PURCHASE_ORDER.map((group) => {
    const groupItems = items.filter((item) => item.group === group);
    if (!groupItems.length) return "";
    return `${group}\n${groupItems.map((item) => `- ${item.name} ${item.displayAmount}`).join("\n")}`;
  }).filter(Boolean).join("\n\n");

  navigator.clipboard?.writeText(text)
    .then(() => showToast("采购清单已复制。"))
    .catch(() => showToast("当前浏览器不支持自动复制。"));
}

function openPantryDrawer() {
  els.pantryBody.innerHTML = renderPantryContent();
  els.pantryDrawer.classList.add("is-open");
  els.pantryDrawer.setAttribute("aria-hidden", "false");
  bindPantryEvents();
}

function closePantryDrawer() {
  els.pantryDrawer.classList.remove("is-open");
  els.pantryDrawer.setAttribute("aria-hidden", "true");
}

function renderPantryContent() {
  return `
    <div class="settings-head">
      <h2 id="pantryTitle">家里已有</h2>
      <p>这里记录临时库存，只用于扣减采购清单；米、油、盐仍按常备处理。</p>
    </div>

    <section class="pantry-quick">
      <h3>常见库存</h3>
      <div class="pantry-chip-row">
        ${COMMON_PANTRY_ITEMS.map((item, index) => `
          <button class="filter-chip" type="button" data-quick-pantry="${index}">
            ${escapeHtml(item.name)} ${formatDecimal(item.amount)}${escapeHtml(item.unit)}
          </button>
        `).join("")}
      </div>
    </section>

    <section class="pantry-form">
      <label>
        食材
        <input id="pantryName" value="" placeholder="如：鸡蛋、土豆、猪排骨" />
      </label>
      <label>
        数量
        <input id="pantryAmount" value="" inputmode="decimal" placeholder="如：2" />
      </label>
      <label>
        单位
        <select id="pantryUnit">
          ${PANTRY_UNITS.map((unit) => `<option value="${unit}">${unit}</option>`).join("")}
        </select>
      </label>
      <button class="primary-button compact" type="button" data-add-pantry>加入库存</button>
    </section>

    <section class="pantry-list">
      <div class="pantry-list-head">
        <h3>当前库存</h3>
        ${state.pantry.length ? `<button class="inline-button" type="button" data-clear-pantry>清空</button>` : ""}
      </div>
      ${state.pantry.length ? state.pantry.map(renderPantryEntry).join("") : `<div class="shopping-empty">还没有记录库存。</div>`}
    </section>
  `;
}

function bindPantryEvents() {
  els.pantryBody.querySelector("[data-add-pantry]")?.addEventListener("click", addPantryFromForm);
  els.pantryBody.querySelectorAll("[data-quick-pantry]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = COMMON_PANTRY_ITEMS[Number(button.dataset.quickPantry)];
      if (!item) return;
      addPantryStock(item.name, item.amount, item.unit);
      refreshPantryAndShopping(`${item.name} 已加入库存。`);
    });
  });
  els.pantryBody.querySelectorAll("[data-delete-pantry]").forEach((button) => {
    button.addEventListener("click", () => removePantryItem(button.dataset.deletePantry));
  });
  els.pantryBody.querySelector("[data-clear-pantry]")?.addEventListener("click", clearPantry);
}

function renderPantryEntry(entry) {
  return `
    <article class="pantry-entry">
      <div>
        <strong>${escapeHtml(entry.name)}</strong>
        <span>${escapeHtml(formatPantryEntryAmount(entry))}</span>
      </div>
      <button class="replace-button" type="button" data-delete-pantry="${escapeAttribute(entry.id)}">删</button>
    </article>
  `;
}

function addPantryFromForm() {
  const name = document.getElementById("pantryName")?.value.trim();
  const amount = Number(document.getElementById("pantryAmount")?.value);
  const unit = document.getElementById("pantryUnit")?.value || "克";
  if (!name || !Number.isFinite(amount) || amount <= 0) {
    showToast("请填写食材和有效数量。");
    return;
  }
  addPantryStock(name, amount, unit);
  refreshPantryAndShopping(`${name} 已加入库存。`);
}

function addPantryFromShopping(key) {
  const item = buildShoppingItems().find((candidate) => candidate.key === key);
  if (!item) return;
  const stock = shoppingItemToPantryStock(item);
  addPantryStock(item.name, stock.amount, stock.unit);
  refreshPantryAndShopping(`${item.name} 已记为家里有。`);
}

function shoppingItemToPantryStock(item) {
  const amountG = item.neededAmountG > 0 ? item.neededAmountG : item.amountG;
  const amountOther = item.neededAmountOther > 0 ? item.neededAmountOther : item.amountOther;
  if (amountG > 0) {
    if (item.name.includes("鸡蛋")) {
      return { amount: Math.max(1, Math.ceil(amountG / 50)), unit: "个" };
    }
    if (item.name.includes("豆腐")) {
      return { amount: Math.max(1, Math.ceil(amountG / 350)), unit: "块" };
    }
    const grams = roundByGroup(amountG, item.group);
    if (grams >= 450) {
      return { amount: Number(formatDecimal(grams / 500)), unit: "斤" };
    }
    return { amount: grams, unit: "克" };
  }
  return {
    amount: Math.max(1, Math.ceil(amountOther || 1)),
    unit: item.unit || "份",
  };
}

function addPantryStock(name, amount, unit) {
  const stock = pantryAmountToStock(name, amount, unit);
  state.pantry = normalizePantryList([
    {
      id: `pantry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      amount,
      unit,
      amountG: stock.amountG,
      amountOther: stock.amountOther,
      updatedAt: new Date().toISOString(),
    },
    ...state.pantry,
  ]);
  saveJson(STORAGE_KEYS.pantry, state.pantry);
}

function removePantryItem(id) {
  state.pantry = state.pantry.filter((entry) => entry.id !== id);
  saveJson(STORAGE_KEYS.pantry, state.pantry);
  refreshPantryAndShopping("库存已删除。");
}

function clearPantry() {
  state.pantry = [];
  saveJson(STORAGE_KEYS.pantry, state.pantry);
  refreshPantryAndShopping("库存已清空。");
}

function refreshPantryAndShopping(message) {
  if (els.pantryDrawer.classList.contains("is-open")) {
    els.pantryBody.innerHTML = renderPantryContent();
    bindPantryEvents();
  }
  renderShopping();
  showToast(message);
}

function openReimburseDrawer() {
  state.reimbursementDraftImage = null;
  els.reimburseBody.innerHTML = renderReimburseContent();
  els.reimburseDrawer.classList.add("is-open");
  els.reimburseDrawer.setAttribute("aria-hidden", "false");
  bindReimburseEvents();
}

function closeReimburseDrawer() {
  els.reimburseDrawer.classList.remove("is-open");
  els.reimburseDrawer.setAttribute("aria-hidden", "true");
}

function renderReimburseContent() {
  const total = state.reimbursements.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  return `
    <div class="settings-head">
      <h2 id="reimburseTitle">采购报销</h2>
      <p>记录当天买菜付款截图和总金额，后续可按记录报销或扣备用金。</p>
    </div>

    <section class="reimburse-summary">
      <div>
        <span>待核对合计</span>
        <strong>¥${formatMoney(total)}</strong>
      </div>
      <button class="inline-button" type="button" data-copy-reimburse ${state.reimbursements.length ? "" : "disabled"}>复制汇总</button>
    </section>

    <section class="reimburse-form">
      <label>
        日期
        <input id="reimburseDate" type="date" value="${today}" />
      </label>
      <label>
        总金额
        <input id="reimburseAmount" inputmode="decimal" placeholder="128.5" />
      </label>
      <label class="reimburse-file-field">
        付款截图
        <input id="reimburseImage" type="file" accept="image/*" />
      </label>
      <label class="reimburse-note-field">
        备注
        <input id="reimburseNote" placeholder="市场买菜、超市补货" />
      </label>
      <div id="reimbursePreview" class="reimburse-preview is-empty">未选择截图</div>
      <button class="primary-button compact" type="button" data-save-reimburse>保存报销记录</button>
    </section>

    <section class="reimburse-list">
      <div class="pantry-list-head">
        <h3>报销记录</h3>
        ${state.reimbursements.length ? `<button class="inline-button" type="button" data-clear-reimburse>清空</button>` : ""}
      </div>
      ${state.reimbursements.length ? state.reimbursements.map(renderReimburseEntry).join("") : `<div class="shopping-empty">还没有报销记录。</div>`}
    </section>
  `;
}

function bindReimburseEvents() {
  els.reimburseBody.querySelector("#reimburseImage")?.addEventListener("change", handleReimburseImage);
  els.reimburseBody.querySelector("[data-save-reimburse]")?.addEventListener("click", saveReimbursement);
  els.reimburseBody.querySelector("[data-copy-reimburse]")?.addEventListener("click", copyReimbursementSummary);
  els.reimburseBody.querySelector("[data-clear-reimburse]")?.addEventListener("click", clearReimbursements);
  els.reimburseBody.querySelectorAll("[data-delete-reimburse]").forEach((button) => {
    button.addEventListener("click", () => deleteReimbursement(button.dataset.deleteReimburse));
  });
}

function renderReimburseEntry(entry) {
  return `
    <article class="reimburse-entry">
      ${entry.image ? `<img src="${entry.image}" alt="付款截图" loading="lazy" />` : `<div class="reimburse-thumb-empty">无图</div>`}
      <div class="reimburse-entry-main">
        <strong>¥${formatMoney(entry.amount)}</strong>
        <span>${escapeHtml(formatRecordDate(entry.date))}${entry.note ? ` · ${escapeHtml(entry.note)}` : ""}</span>
      </div>
      <button class="replace-button" type="button" data-delete-reimburse="${escapeAttribute(entry.id)}">删</button>
    </article>
  `;
}

async function handleReimburseImage(event) {
  const file = event.target.files?.[0];
  const preview = document.getElementById("reimbursePreview");
  if (!file) {
    state.reimbursementDraftImage = null;
    if (preview) preview.textContent = "未选择截图";
    preview?.classList.add("is-empty");
    return;
  }
  if (!file.type.startsWith("image/")) {
    showToast("请上传图片格式的付款截图。");
    return;
  }
  try {
    const dataUrl = await compressImageFile(file, 1280, 0.72);
    state.reimbursementDraftImage = dataUrl;
    if (preview) {
      preview.innerHTML = `<img src="${dataUrl}" alt="付款截图预览" />`;
      preview.classList.remove("is-empty");
    }
  } catch (error) {
    console.error(error);
    showToast("截图读取失败，请换一张图片。");
  }
}

function saveReimbursement() {
  const date = document.getElementById("reimburseDate")?.value || new Date().toISOString().slice(0, 10);
  const amount = Number(document.getElementById("reimburseAmount")?.value);
  const note = document.getElementById("reimburseNote")?.value.trim() || "";
  if (!Number.isFinite(amount) || amount <= 0) {
    showToast("请填写有效采购金额。");
    return;
  }
  state.reimbursements = normalizeReimbursements([
    {
      id: `reimburse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date,
      amount,
      note,
      image: state.reimbursementDraftImage,
      createdAt: new Date().toISOString(),
    },
    ...state.reimbursements,
  ]);
  saveJson(STORAGE_KEYS.reimbursements, state.reimbursements);
  state.reimbursementDraftImage = null;
  els.reimburseBody.innerHTML = renderReimburseContent();
  bindReimburseEvents();
  showToast("报销记录已保存。");
}

function deleteReimbursement(id) {
  state.reimbursements = state.reimbursements.filter((entry) => entry.id !== id);
  saveJson(STORAGE_KEYS.reimbursements, state.reimbursements);
  els.reimburseBody.innerHTML = renderReimburseContent();
  bindReimburseEvents();
  showToast("报销记录已删除。");
}

function clearReimbursements() {
  state.reimbursements = [];
  saveJson(STORAGE_KEYS.reimbursements, state.reimbursements);
  els.reimburseBody.innerHTML = renderReimburseContent();
  bindReimburseEvents();
  showToast("报销记录已清空。");
}

function copyReimbursementSummary() {
  if (!state.reimbursements.length) {
    showToast("暂无可复制的报销记录。");
    return;
  }
  const total = state.reimbursements.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const lines = [
    `采购报销合计：¥${formatMoney(total)}`,
    ...state.reimbursements.map((entry) => `- ${formatRecordDate(entry.date)} ¥${formatMoney(entry.amount)}${entry.note ? ` ${entry.note}` : ""}${entry.image ? "（有付款截图）" : ""}`),
  ];
  navigator.clipboard?.writeText(lines.join("\n"))
    .then(() => showToast("报销汇总已复制。"))
    .catch(() => showToast("当前浏览器不支持自动复制。"));
}

function renderRecipeFilters() {
  els.recipeFilters.innerHTML = FILTERS.map((filter) => `
    <button class="filter-chip ${state.recipeFilter === filter.id ? "is-active" : ""}" type="button" data-filter="${filter.id}">
      ${filter.label}
    </button>
  `).join("");
  els.recipeFilters.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.recipeFilter = button.dataset.filter;
      renderRecipeFilters();
      renderRecipeList();
    });
  });
}

function renderRecipeList() {
  const keyword = state.recipeSearch.toLowerCase();
  const recipes = state.recipes.filter((recipe) => {
    if (state.reviewOnly && !recipe.needs_review) return false;
    if (state.recipeFilter !== "all" && recipe.dish_type !== state.recipeFilter) return false;
    if (!keyword) return true;
    const haystack = [
      recipe.name,
      recipe.method,
      recipe.dish_type,
      ...(recipe.ingredients || []).map((item) => item.name),
    ].join(" ").toLowerCase();
    return haystack.includes(keyword);
  }).slice(0, 80);

  if (!recipes.length) {
    els.recipeList.innerHTML = `<div class="shopping-empty">没有匹配菜谱。</div>`;
    return;
  }

  els.recipeList.innerHTML = recipes.map((recipe) => `
    <article class="recipe-card" data-open-card="${recipe.id}">
      <img class="recipe-thumb" src="${assetUrl(recipe.image_path)}" alt="${escapeHtml(recipe.name)}" loading="lazy" />
      <div class="recipe-card-content">
        <div>
          <div class="recipe-title-line">
            <h4>${escapeHtml(recipe.name)}</h4>
            ${recipe.needs_review ? `<span class="tag review-badge">复核</span>` : ""}
          </div>
          <div class="recipe-meta">${dishTypeLabel(recipe.dish_type)} · ${escapeHtml(recipe.method)} · 置信度 ${Math.round((recipe.confidence || 0) * 100)}%</div>
        </div>
        <div class="tag-row">
          ${(recipe.tags?.food_groups || []).slice(0, 3).map((tag) => `<span class="tag green">${escapeHtml(tag)}</span>`).join("")}
        </div>
      </div>
    </article>
  `).join("");

  els.recipeList.querySelectorAll("[data-open-card]").forEach((card) => {
    card.addEventListener("click", () => openRecipeDrawer(card.dataset.openCard));
  });
}

function openRecipeDrawer(recipeId, editMode = false) {
  const recipe = findRecipe(recipeId);
  if (!recipe) return;
  els.drawerBody.innerHTML = renderRecipeDetail(recipe, editMode);
  els.recipeDrawer.classList.add("is-open");
  els.recipeDrawer.setAttribute("aria-hidden", "false");

  els.drawerBody.querySelectorAll("[data-edit-recipe]").forEach((button) => {
    button.addEventListener("click", () => openRecipeDrawer(button.dataset.editRecipe, true));
  });
  els.drawerBody.querySelectorAll("[data-save-recipe]").forEach((button) => {
    button.addEventListener("click", () => saveRecipeCorrection(button.dataset.saveRecipe));
  });
}

function closeRecipeDrawer() {
  els.recipeDrawer.classList.remove("is-open");
  els.recipeDrawer.setAttribute("aria-hidden", "true");
}

function renderRecipeDetail(recipe, editMode) {
  const correction = state.corrections[recipe.id] || {};
  const ingredientsText = (correction.ingredientsText || ingredientsToText(recipe.ingredients)).trim();
  const stepsText = (correction.stepsText || (recipe.steps_short || []).join("\n")).trim();
  return `
    <div class="drawer-hero">
      <img src="${assetUrl(recipe.image_path)}" alt="${escapeHtml(recipe.name)}" />
      <h2 id="drawerTitle">${escapeHtml(recipe.name)}</h2>
      <div class="tag-row">
        <span class="tag green">${dishTypeLabel(recipe.dish_type)}</span>
        <span class="tag blue">${escapeHtml(recipe.method)}</span>
        <span class="tag">${recipe.time_minutes || 30} 分钟</span>
        ${recipe.needs_review ? `<span class="tag red">需复核</span>` : ""}
      </div>
    </div>

    <section class="detail-section">
      <h3>食材</h3>
      <ul class="ingredient-lines">
        ${(recipe.ingredients || []).filter((item) => !item.is_condiment).map((item) => `
          <li>${escapeHtml(item.name)} ${escapeHtml(displayIngredientAmount(item))}</li>
        `).join("")}
      </ul>
    </section>

    <section class="detail-section">
      <h3>做法</h3>
      <ol class="step-list">
        ${(recipe.steps_short || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
      </ol>
    </section>

    ${recipe.note ? `<section class="detail-section"><h3>注意</h3><p class="shopping-note">${escapeHtml(recipe.note)}</p></section>` : ""}

    <section class="detail-section">
      <button class="inline-button" type="button" data-edit-recipe="${recipe.id}">校正</button>
    </section>

    ${editMode ? `
      <section class="edit-box">
        <div class="edit-field">
          <label for="edit-name">菜名</label>
          <input id="edit-name" value="${escapeAttribute(recipe.name)}" />
        </div>
        <div class="edit-field">
          <label for="edit-servings">标准份量</label>
          <input id="edit-servings" inputmode="numeric" value="${recipe.base_servings || 3}" />
        </div>
        <div class="edit-field">
          <label for="edit-ingredients">食材，每行一个</label>
          <textarea id="edit-ingredients">${escapeHtml(ingredientsText)}</textarea>
        </div>
        <div class="edit-field">
          <label for="edit-steps">做法，每行一步</label>
          <textarea id="edit-steps">${escapeHtml(stepsText)}</textarea>
        </div>
        <button class="primary-button" type="button" data-save-recipe="${recipe.id}">保存校正</button>
      </section>
    ` : ""}
  `;
}

function saveRecipeCorrection(recipeId) {
  const name = document.getElementById("edit-name").value.trim();
  const servings = Number(document.getElementById("edit-servings").value) || 3;
  const ingredientsText = document.getElementById("edit-ingredients").value.trim();
  const stepsText = document.getElementById("edit-steps").value.trim();
  state.corrections[recipeId] = { name, base_servings: servings, ingredientsText, stepsText };
  saveJson(STORAGE_KEYS.corrections, state.corrections);
  state.recipes = applyCorrections(state.payload.recipes || []);
  if (state.plan) {
    state.plan = hydratePlan(serializablePlan(state.plan));
    saveJson(STORAGE_KEYS.plan, serializablePlan(state.plan));
    renderPlan();
    renderShopping();
  }
  renderRecipeList();
  openRecipeDrawer(recipeId, false);
  showToast("菜谱校正已保存到本机。");
}

function openIngredientReplace(name) {
  const options = ingredientSubstitutions(name);
  els.replaceBody.innerHTML = `
    <h2 id="replaceTitle">${escapeHtml(name)} 买不到</h2>
    <div class="shopping-note">选择后会更新采购清单，不改变原菜谱。</div>
    <div class="replace-options">
      ${options.map((option) => `
        <button class="replace-option" type="button" data-pick-ingredient="${escapeAttribute(name)}" data-target="${escapeAttribute(option.name)}">
          <strong>${escapeHtml(option.name)}</strong>
          <span>${escapeHtml(option.note)}</span>
        </button>
      `).join("")}
    </div>
  `;
  openReplaceSheet();
  els.replaceBody.querySelectorAll("[data-pick-ingredient]").forEach((button) => {
    button.addEventListener("click", () => {
      state.ingredientReplacements[button.dataset.pickIngredient] = button.dataset.target;
      saveJson(STORAGE_KEYS.ingredientReplacements, state.ingredientReplacements);
      renderShopping();
      closeReplaceSheet();
      showToast("替换已应用到采购清单。");
    });
  });
}

function openDishReplace(mealId, recipeId) {
  const meal = state.plan?.meals?.find((item) => item.id === mealId);
  const current = findRecipe(recipeId);
  if (!meal || !current) return;
  const rules = mealRules(meal.memberIds || []);
  const used = new Set(state.plan.meals.flatMap((item) => item.dishes.map((dish) => dish.recipe.id)));
  const options = state.recipes
    .filter((recipe) => recipe.id !== recipeId)
    .filter((recipe) => !used.has(recipe.id))
    .filter((recipe) => !violatesHardAvoid(recipe, rules.hardAvoid))
    .filter((recipe) => recipe.dish_type === current.dish_type || recipe.protein_group === current.protein_group)
    .sort((a, b) => {
      const aScore = (a.selection_score || 0) + memberFitScore(a, meal.memberIds || [], rules);
      const bScore = (b.selection_score || 0) + memberFitScore(b, meal.memberIds || [], rules);
      return bScore - aScore;
    })
    .slice(0, 4);

  els.replaceBody.innerHTML = `
    <h2 id="replaceTitle">替换 ${escapeHtml(current.name)}</h2>
    <div class="replace-options">
      ${options.map((recipe) => `
        <button class="replace-option" type="button" data-pick-dish="${recipe.id}" data-meal="${mealId}" data-current="${recipeId}">
          <strong>${escapeHtml(recipe.name)}</strong>
          <span>${dishTypeLabel(recipe.dish_type)} · ${escapeHtml(recipe.method)} · ${reasonForRecipe(recipe, recipe.dish_type)}</span>
        </button>
      `).join("")}
    </div>
  `;
  openReplaceSheet();
  els.replaceBody.querySelectorAll("[data-pick-dish]").forEach((button) => {
    button.addEventListener("click", () => {
      replaceDish(button.dataset.meal, button.dataset.current, button.dataset.pickDish);
      closeReplaceSheet();
      showToast("已换成另一道菜。");
    });
  });
}

function replaceDish(mealId, currentId, nextId) {
  const meal = state.plan.meals.find((item) => item.id === mealId);
  const next = findRecipe(nextId);
  if (!meal || !next) return;
  meal.dishes = meal.dishes.map((dish) => {
    if (dish.recipe.id !== currentId) return dish;
    return { recipe: next, servings: dish.servings, reason: "临时替换，采购清单已更新" };
  });
  state.plan.nutrition = buildNutritionSummary(state.plan.meals);
  saveJson(STORAGE_KEYS.plan, serializablePlan(state.plan));
  renderPlan();
  renderShopping();
}

function openReplaceSheet() {
  els.replaceSheet.classList.add("is-open");
  els.replaceSheet.setAttribute("aria-hidden", "false");
}

function closeReplaceSheet() {
  els.replaceSheet.classList.remove("is-open");
  els.replaceSheet.setAttribute("aria-hidden", "true");
}

function openSettingsDrawer() {
  els.settingsBody.innerHTML = renderSettingsForm();
  els.settingsDrawer.classList.add("is-open");
  els.settingsDrawer.setAttribute("aria-hidden", "false");

  const saveButton = els.settingsBody.querySelector("[data-save-settings]");
  if (saveButton) {
    saveButton.addEventListener("click", saveFamilySettings);
  }
  const resetButton = els.settingsBody.querySelector("[data-reset-settings]");
  if (resetButton) {
    resetButton.addEventListener("click", resetFamilySettings);
  }
}

function closeSettingsDrawer() {
  els.settingsDrawer.classList.remove("is-open");
  els.settingsDrawer.setAttribute("aria-hidden", "true");
}

function renderSettingsForm() {
  const coreMembers = state.members.filter((member) => !member.id.startsWith("guest"));
  return `
    <div class="settings-head">
      <h2 id="settingsTitle">家庭设置</h2>
      <p>饭量按白米饭碗数折算采购量；米和大米仍按常备库存处理，不进入采购清单。</p>
    </div>
    <div class="settings-list">
      ${coreMembers.map(renderMemberSetting).join("")}
    </div>
    <div class="plan-actions settings-actions">
      <button class="primary-button compact" type="button" data-save-settings>保存设置</button>
      <button class="inline-button" type="button" data-reset-settings>恢复默认</button>
    </div>
  `;
}

function renderMemberSetting(member) {
  const hardAvoid = (member.hardAvoid || []).join("、");
  const softAvoid = (member.softAvoid || []).join("、");
  const prepNotes = (member.prepNotes || []).join("、");
  return `
    <section class="member-setting-card" data-member-id="${escapeAttribute(member.id)}">
      <div class="member-setting-title">
        <strong>${escapeHtml(member.name)}</strong>
        <span>饭量 ${formatFactor(member.factor)}</span>
      </div>
      <div class="settings-grid">
        <label>
          姓名
          <input data-field="name" value="${escapeAttribute(member.name)}" />
        </label>
        <label>
          饭量
          <input data-field="factor" inputmode="decimal" value="${escapeAttribute(member.factor)}" />
        </label>
        <label>
          类型
          <select data-field="ageGroup">
            ${ageGroupOptions(member.ageGroup)}
          </select>
        </label>
        <label>
          硬忌口
          <input data-field="hardAvoid" value="${escapeAttribute(hardAvoid)}" placeholder="如：香菜、辣椒" />
        </label>
        <label>
          做法提醒
          <input data-field="softAvoid" value="${escapeAttribute(softAvoid)}" placeholder="如：葱花、香菜" />
        </label>
        <label>
          备注
          <input data-field="prepNotes" value="${escapeAttribute(prepNotes)}" placeholder="如：少辣、鱼刺留意" />
        </label>
      </div>
    </section>
  `;
}

function ageGroupOptions(current) {
  const options = [
    ["adult", "成人"],
    ["adult_like", "少年/接近成年"],
    ["young_child", "幼儿"],
    ["elder", "老人"],
  ];
  return options.map(([value, label]) => `
    <option value="${value}" ${value === current ? "selected" : ""}>${label}</option>
  `).join("");
}

function saveFamilySettings() {
  const currentById = new Map(state.members.map((member) => [member.id, member]));
  const rows = [...els.settingsBody.querySelectorAll(".member-setting-card")];
  const updated = rows.map((row) => {
    const id = row.dataset.memberId;
    const current = currentById.get(id) || { id };
    const getValue = (field) => row.querySelector(`[data-field="${field}"]`)?.value.trim() || "";
    return {
      ...current,
      id,
      name: getValue("name") || current.name || id,
      factor: Math.max(0.1, Number(getValue("factor")) || current.factor || 1),
      ageGroup: getValue("ageGroup") || current.ageGroup || "adult",
      hardAvoid: splitList(getValue("hardAvoid")),
      softAvoid: splitList(getValue("softAvoid")),
      prepNotes: splitList(getValue("prepNotes")),
    };
  });
  const guests = state.members.filter((member) => member.id.startsWith("guest"));
  state.members = [...updated, ...guests];
  const validMemberIds = new Set(state.members.map((member) => member.id));
  MEALS.forEach((meal) => {
    state.meals[meal.id] = (state.meals[meal.id] || []).filter((id) => validMemberIds.has(id));
  });
  state.plan = null;
  state.checked = {};
  saveJson(STORAGE_KEYS.members, state.members);
  saveJson(STORAGE_KEYS.plan, state.plan);
  saveJson(STORAGE_KEYS.checked, state.checked);
  closeSettingsDrawer();
  renderMealPicker();
  renderEmptyStates();
  renderHistory();
  showToast("家庭设置已保存，请重新生成菜单。");
}

function resetFamilySettings() {
  state.members = structuredClone(DEFAULT_MEMBERS);
  MEALS.forEach((meal) => {
    state.meals[meal.id] = [];
  });
  state.plan = null;
  state.checked = {};
  saveJson(STORAGE_KEYS.members, state.members);
  saveJson(STORAGE_KEYS.plan, state.plan);
  saveJson(STORAGE_KEYS.checked, state.checked);
  closeSettingsDrawer();
  renderMealPicker();
  renderEmptyStates();
  renderHistory();
  showToast("已恢复默认家庭设置。");
}

function ingredientSubstitutions(name) {
  const pools = [
    {
      test: /鲈鱼|鲫鱼|鲳鱼|黄花鱼|带鱼|鱼/,
      options: [
        ["多宝鱼", "同样适合清蒸，刺相对少"],
        ["鲳鱼", "珠三角市场常见，做法接近"],
        ["草鱼段", "更容易买，儿童餐要留意鱼刺"],
      ],
    },
    {
      test: /虾|虾仁|河虾/,
      options: [
        ["虾仁", "省处理，适合快炒"],
        ["鲜虾", "口感更好，需去虾线"],
        ["鱼片", "同属水产蛋白，做法略调"],
      ],
    },
    {
      test: /芥蓝|菜心|油菜|小白菜|生菜|菠菜|空心菜|蕹菜|苋菜|豆苗|西兰花/,
      options: [
        ["菜心", "珠三角常见叶菜，清炒稳定"],
        ["芥蓝", "口感清脆，适合蚝油或清炒"],
        ["油麦菜", "容易买，快炒即可"],
      ],
    },
    {
      test: /冬瓜|苦瓜|丝瓜|黄瓜/,
      options: [
        ["冬瓜", "适合汤和清淡菜"],
        ["丝瓜", "快熟，适合汤或炒蛋"],
        ["节瓜", "广东常见，汤菜都稳"],
      ],
    },
    {
      test: /排骨|猪肉|瘦肉/,
      options: [
        ["鸡腿肉", "同为常见蛋白，炖炒都方便"],
        ["瘦肉", "更快熟，适合汤和快炒"],
        ["猪排骨", "保留原菜风味，耗时稍长"],
      ],
    },
    {
      test: /鸡|鸡腿|鸡翅/,
      options: [
        ["鸡腿肉", "易买易处理"],
        ["鸡翅", "孩子接受度高"],
        ["瘦肉", "买不到鸡时可补蛋白"],
      ],
    },
    {
      test: /豆腐|腐竹|豆干/,
      options: [
        ["豆腐", "便宜易买，适合汤和烧菜"],
        ["腐竹", "需提前泡发，口感更有嚼劲"],
        ["豆干", "适合快炒，采购稳定"],
      ],
    },
    {
      test: /鸡蛋|蛋/,
      options: [
        ["鸡蛋", "最稳妥"],
        ["豆腐", "清淡蛋白替换"],
        ["虾仁", "蛋白更足，成本略高"],
      ],
    },
  ];
  const pool = pools.find((item) => item.test.test(name));
  const options = pool?.options || [
    ["菜心", "常见蔬菜补位"],
    ["豆腐", "清淡蛋白补位"],
    ["鸡蛋", "容易采购，做法简单"],
  ];
  const planHardAvoid = unique((state.plan?.meals || []).flatMap((meal) => mealRules(meal.memberIds || []).hardAvoid));
  return options
    .filter(([optionName]) => optionName !== name)
    .filter(([optionName]) => !textIncludesAvoid(optionName, planHardAvoid))
    .slice(0, 3)
    .map(([optionName, note]) => ({ name: optionName, note }));
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.toggle("is-active", screen.id === `tab-${tab}`);
  });
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tab);
  });
  if (tab === "shopping") renderShopping();
  if (tab === "recipes") renderRecipeList();
}

function applyCorrections(recipes) {
  return recipes.map((recipe) => {
    const correction = state.corrections[recipe.id];
    if (!correction) return recipe;
    const corrected = structuredClone(recipe);
    corrected.name = correction.name || recipe.name;
    corrected.base_servings = Number(correction.base_servings) || recipe.base_servings;
    corrected.steps_short = correction.stepsText
      ? correction.stepsText.split("\n").map((line) => line.trim()).filter(Boolean)
      : recipe.steps_short;
    corrected.ingredients = correction.ingredientsText
      ? parseIngredientText(correction.ingredientsText, recipe.ingredients)
      : recipe.ingredients;
    corrected.needs_review = false;
    return corrected;
  });
}

function hydratePlan(savedPlan) {
  if (!savedPlan?.meals) return savedPlan;
  return {
    ...savedPlan,
    meals: savedPlan.meals.map((meal) => ({
      ...meal,
      dishes: meal.dishes
        .map((dish) => ({
          ...dish,
          recipe: findRecipe(dish.recipeId || dish.recipe?.id) || dish.recipe,
        }))
        .filter((dish) => Boolean(dish.recipe)),
    })).filter((meal) => meal.dishes.length),
  };
}

function serializablePlan(plan) {
  return {
    ...plan,
    meals: plan.meals.map((meal) => ({
      ...meal,
      dishes: meal.dishes.map((dish) => ({
        recipeId: dish.recipe.id,
        servings: dish.servings,
        reason: dish.reason,
      })),
    })),
  };
}

function findRecipe(id) {
  return state.recipes.find((recipe) => String(recipe.id) === String(id));
}

function totalFactor(memberIds) {
  return memberIds.reduce((sum, id) => {
    const member = state.members.find((item) => item.id === id);
    return sum + (member?.factor || 1);
  }, 0);
}

function memberName(id) {
  return state.members.find((member) => member.id === id)?.name || "";
}

function formatFactor(value) {
  return Number(value || 0).toFixed(1).replace(/\.0$/, "");
}

function tomorrowIsoDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function seededNumber(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function shouldShop(ingredient) {
  if (!ingredient) return false;
  if (ingredient.exclude_from_shopping) return false;
  if (ingredient.is_condiment) return false;
  const pantryStaples = ["盐", "精盐", "食用油", "植物油", "花生油", "色拉油", "调和油", "菜籽油", "玉米油", "芝麻油", "香油", "麻油", "猪油", "米", "大米"];
  if (pantryStaples.includes(normalizeIngredientKey(ingredient.name))) return false;
  return true;
}

function normalizeIngredientKey(name) {
  return String(name || "")
    .replace(/[（(].*?[）)]/g, "")
    .replace(/^(新鲜|鲜|净)/, "")
    .replace(/\s+/g, "")
    .trim();
}

function normalizePantryList(items) {
  return (items || []).map((entry) => {
    const amount = Number(entry.amount || 0);
    const unit = entry.unit || "克";
    const stock = entry.amountG || entry.amountOther
      ? { amountG: Number(entry.amountG || 0), amountOther: Number(entry.amountOther || 0) }
      : pantryAmountToStock(entry.name, amount, unit);
    return {
      id: entry.id || `pantry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: String(entry.name || "").trim(),
      amount,
      unit,
      amountG: stock.amountG,
      amountOther: stock.amountOther,
      updatedAt: entry.updatedAt || new Date().toISOString(),
    };
  }).filter((entry) => entry.name && (entry.amountG > 0 || entry.amountOther > 0));
}

function normalizeReimbursements(items) {
  return (items || [])
    .map((entry) => ({
      id: entry.id || `reimburse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: entry.date || new Date().toISOString().slice(0, 10),
      amount: Number(entry.amount || 0),
      note: String(entry.note || "").trim(),
      image: entry.image || null,
      createdAt: entry.createdAt || new Date().toISOString(),
    }))
    .filter((entry) => entry.amount > 0)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 60);
}

function pantryAmountToStock(name, amount, unit) {
  const value = Number(amount || 0);
  if (!value) return { amountG: 0, amountOther: 0 };
  if (unit === "克") return { amountG: value, amountOther: 0 };
  if (unit === "斤") return { amountG: value * 500, amountOther: 0 };
  if (unit === "两") return { amountG: value * 50, amountOther: 0 };
  const estimate = pantryUnitGramEstimate(name, unit);
  if (estimate) return { amountG: value * estimate, amountOther: 0 };
  if (["个", "只", "棵", "根", "块", "盒", "袋"].includes(unit)) {
    return { amountG: 0, amountOther: value };
  }
  return { amountG: 0, amountOther: value };
}

function pantryUnitGramEstimate(name, unit) {
  if (/鸡蛋|鸭蛋|蛋/.test(name) && ["个", "只"].includes(unit)) return 50;
  if (/豆腐/.test(name) && ["块", "盒"].includes(unit)) return 350;
  if (/土豆|番茄|西红柿|洋葱|茄子|苦瓜|丝瓜|黄瓜/.test(name) && ["个", "根"].includes(unit)) return 180;
  if (/胡萝卜|白萝卜|萝卜/.test(name) && ["个", "根"].includes(unit)) return 220;
  if (/冬瓜|南瓜|节瓜/.test(name) && unit === "块") return 500;
  if (/菜心|芥蓝|生菜|菠菜|白菜|小白菜/.test(name) && unit === "棵") return 250;
  return 0;
}

function purchaseGroupForName(name, fallback) {
  if (/豆腐|腐竹|豆干|豆皮|黄豆|毛豆/.test(name)) return "豆制品";
  if (/鱼|虾|蟹|贝|蛤|鲍|鳝|鱿|鸡|鸭|鹅|肉|排骨|猪|牛|羊|蛋/.test(name)) return "肉蛋水产";
  if (/菜|瓜|笋|菇|椒|茄|番茄|萝卜|藕|芋|豆芽|芥蓝|生菜|菠菜|冬瓜|苦瓜|丝瓜|土豆|胡萝卜/.test(name)) return "蔬菜";
  if (/米|面|粉|饭/.test(name)) return "主食";
  return PURCHASE_ORDER.includes(fallback) ? fallback : "其他";
}

function displayShoppingAmount(item) {
  if (item.coveredByPantry) return "家里有";
  const amountG = Number.isFinite(item.neededAmountG) ? item.neededAmountG : item.amountG;
  const amountOther = Number.isFinite(item.neededAmountOther) ? item.neededAmountOther : item.amountOther;
  if (item.name.includes("鸡蛋") && amountG) {
    return `${Math.max(1, Math.ceil(amountG / 50))} 个`;
  }
  if (item.name.includes("豆腐") && amountG) {
    return `${Math.max(1, Math.ceil(amountG / 350))} 块`;
  }
  if (amountG > 0) {
    const grams = roundByGroup(amountG, item.group);
    if (grams >= 450) {
      const jin = grams / 500;
      if (Math.abs(jin - 0.5) < 0.12) return "约半斤";
      if (Math.abs(jin - 1) < 0.12) return "约 1 斤";
      return `约 ${formatDecimal(jin)} 斤`;
    }
    return `约 ${Math.max(50, grams)} 克`;
  }
  if (amountOther > 0) {
    if (["个", "只", "棵", "根", "块", "盒", "袋"].includes(item.unit)) {
      return `约 ${Math.max(1, Math.ceil(amountOther))} ${item.unit}`;
    }
    return `约 ${formatDecimal(amountOther)} ${item.unit || "份"}`;
  }
  return "适量";
}

function displayPantryDeduction(item) {
  const parts = [];
  if (item.pantryDeductedG > 0) {
    parts.push(formatPantryStockAmount(item.name, item.pantryDeductedG, 0, item.unit, item.group));
  }
  if (item.pantryDeductedOther > 0) {
    parts.push(formatPantryStockAmount(item.name, 0, item.pantryDeductedOther, item.unit, item.group));
  }
  return parts.join("，");
}

function formatPantryStockAmount(name, amountG, amountOther, unit, group) {
  const text = displayShoppingAmount({
    name,
    amountG,
    amountOther,
    unit,
    group,
    coveredByPantry: false,
  });
  return text.replace(/^约\s*/, "");
}

function formatPantryEntryAmount(entry) {
  if (entry.amount > 0 && entry.unit) {
    return `${formatDecimal(entry.amount)}${entry.unit}`;
  }
  return formatPantryStockAmount(entry.name, entry.amountG, entry.amountOther, entry.unit, purchaseGroupForName(entry.name));
}

function roundByGroup(amount, group) {
  if (group === "蔬菜") return Math.ceil(amount / 100) * 100;
  if (group === "肉蛋水产") return Math.ceil(amount / 50) * 50;
  if (group === "豆制品") return Math.ceil(amount / 50) * 50;
  return Math.ceil(amount / 25) * 25;
}

function displayIngredientAmount(item) {
  if (item.amount === null || item.amount === undefined) return item.unit || "适量";
  return `${formatDecimal(item.amount)}${item.unit || ""}`;
}

function ingredientsToText(ingredients) {
  return (ingredients || [])
    .filter((item) => !item.is_condiment)
    .map((item) => `${item.name} ${displayIngredientAmount(item)}`)
    .join("\n");
}

function parseIngredientText(text, originalIngredients) {
  const originalByName = new Map((originalIngredients || []).map((item) => [item.name, item]));
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = line.match(/^(.+?)\s*([0-9]+(?:\.[0-9]+)?)(克|斤|两|个|只|棵|根|块|盒)?$/);
    const name = match ? match[1].trim() : line;
    const amount = match ? Number(match[2]) : null;
    const unit = match ? (match[3] || "克") : "适量";
    const existing = originalByName.get(name);
    const amountG = unit === "克" && amount ? amount : unit === "斤" && amount ? amount * 500 : unit === "两" && amount ? amount * 50 : existing?.amount_g || null;
    return {
      ...(existing || {}),
      name,
      amount,
      unit,
      amount_g: amountG,
      is_condiment: false,
      exclude_from_shopping: false,
      purchase_group: purchaseGroupForName(name, existing?.purchase_group || "其他"),
      food_group: existing?.food_group || purchaseGroupForName(name, "其他"),
      required: true,
    };
  });
}

function dishTypeLabel(type) {
  return {
    main: "荤菜",
    vegetable: "蔬菜",
    tofu: "豆腐",
    egg: "蛋类",
    soup: "汤羹",
    staple: "主食",
  }[type] || "家常菜";
}

function groupBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function splitList(value) {
  return String(value || "")
    .split(/[、,，/；;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function assetUrl(path) {
  if (!path) return "";
  return `../${path.split("/").map(encodeURIComponent).join("/")}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function formatDecimal(value) {
  const number = Number(value || 0);
  return number.toFixed(1).replace(/\.0$/, "");
}

function formatMoney(value) {
  const number = Number(value || 0);
  return number.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function formatRecordDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value || "";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function compressImageFile(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function migrateDefaultMembers(members) {
  const list = Array.isArray(members) ? structuredClone(members) : structuredClone(DEFAULT_MEMBERS);
  let changed = false;
  DEFAULT_MEMBERS.forEach((defaultMember) => {
    if (list.some((member) => member.id === defaultMember.id)) return;
    const sameName = list.find((member) => member.name === defaultMember.name && !String(member.id || "").startsWith("guest"));
    if (sameName) {
      sameName.id = defaultMember.id;
      sameName.factor = Number(sameName.factor || defaultMember.factor);
      sameName.ageGroup = sameName.ageGroup || defaultMember.ageGroup;
    } else {
      list.push(structuredClone(defaultMember));
    }
    changed = true;
  });
  if (changed) {
    saveJson(STORAGE_KEYS.members, list);
  }
  return list;
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

let toastTimer = null;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 2200);
}
