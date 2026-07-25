/**
 * Sharik AI Service
 * Unified AI layer supporting: Gemini, OpenAI, or intelligent Mock mode.
 * Set AI_PROVIDER=gemini|openai|mock in .env
 * Set GEMINI_API_KEY or OPENAI_API_KEY accordingly.
 */

const AI_PROVIDER = process.env.AI_PROVIDER || "mock";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

// ─── Gemini Integration ───────────────────────────────────────────────────────
async function callGemini(prompt, systemInstruction = "") {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ─── OpenAI Integration ───────────────────────────────────────────────────────
async function callOpenAI(messages) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ─── Intelligent Mock Engine ──────────────────────────────────────────────────
const MOCK_ROADMAPS = {
  default: {
    title: "مسار تعلم مخصص",
    estimatedWeeks: 16,
    milestones: [
      { week: 1, title: "الأساسيات والبيئة", skills: ["HTML/CSS الأساسي", "إعداد VS Code", "Git أساسي"], completed: false },
      { week: 3, title: "البرمجة الأساسية", skills: ["JavaScript ES6+", "DOM manipulation", "Fetch API"], completed: false },
      { week: 6, title: "الإطار الأول", skills: ["React.js أساسي", "useState / useEffect", "React Router"], completed: false },
      { week: 9, title: "الاحتراف", skills: ["TypeScript", "State Management", "Testing"], completed: false },
      { week: 12, title: "الواجهة الخلفية", skills: ["Node.js", "Express", "MongoDB"], completed: false },
      { week: 16, title: "المشروع النهائي", skills: ["Portfolio Project", "Deployment", "Optimization"], completed: false },
    ],
    resources: [
      { title: "MDN Web Docs", url: "https://developer.mozilla.org", type: "documentation" },
      { title: "The Odin Project", url: "https://www.theodinproject.com", type: "course" },
      { title: "JavaScript.info", url: "https://javascript.info", type: "tutorial" },
    ],
    mentorSkills: ["JavaScript", "React", "Node.js", "Frontend Development"],
    careerPaths: ["مطور واجهات أمامية", "مطور Full Stack", "مطور تطبيقات"],
  },
};

function getMockRoadmap(goal, userSkills = []) {
  const goalLower = (goal || "").toLowerCase();
  let roadmap = { ...MOCK_ROADMAPS.default };

  if (goalLower.includes("frontend") || goalLower.includes("واجهات") || goalLower.includes("ريأكت")) {
    roadmap.title = "مسار مطور واجهات أمامية (Frontend Developer)";
    roadmap.milestones[2].title = "React.js المتقدم";
  } else if (goalLower.includes("backend") || goalLower.includes("خلفي") || goalLower.includes("سيرفر")) {
    roadmap.title = "مسار مطور الواجهات الخلفية (Backend Developer)";
    roadmap.estimatedWeeks = 14;
    roadmap.milestones = [
      { week: 1, title: "أساسيات البرمجة", skills: ["JavaScript/Python", "Terminal", "Git"], completed: false },
      { week: 3, title: "Node.js والخوادم", skills: ["Node.js", "Express.js", "REST APIs"], completed: false },
      { week: 6, title: "قواعد البيانات", skills: ["MongoDB", "PostgreSQL", "Redis"], completed: false },
      { week: 9, title: "الأمان والمصادقة", skills: ["JWT", "OAuth", "bcrypt", "HTTPS"], completed: false },
      { week: 12, title: "النشر والبنية التحتية", skills: ["Docker", "CI/CD", "Cloud Deployment"], completed: false },
      { week: 14, title: "مشروع متكامل", skills: ["API Documentation", "Performance", "Monitoring"], completed: false },
    ];
  } else if (goalLower.includes("ai") || goalLower.includes("ذكاء") || goalLower.includes("machine")) {
    roadmap.title = "مسار مهندس الذكاء الاصطناعي";
    roadmap.estimatedWeeks = 20;
    roadmap.milestones[2].title = "التعلم الآلي الأساسي";
    roadmap.milestones[2].skills = ["Python", "NumPy", "Pandas", "scikit-learn"];
  } else if (goalLower.includes("ui") || goalLower.includes("ux") || goalLower.includes("تصميم")) {
    roadmap.title = "مسار مصمم UI/UX";
    roadmap.estimatedWeeks = 12;
    roadmap.milestones[2].title = "أدوات التصميم";
    roadmap.milestones[2].skills = ["Figma", "Adobe XD", "Prototyping"];
  }

  // Personalize based on existing skills
  if (userSkills.length > 0) {
    roadmap.milestones[0].completed = true;
    roadmap.note = `بناءً على مهاراتك الحالية (${userSkills.slice(0, 3).join(", ")}), يمكنك البدء من المرحلة الثانية.`;
  }

  return roadmap;
}

const MOCK_MENTOR_RESPONSES = {
  greeting: [
    "مرحباً! أنا مساعدك الذكي في شارك. كيف يمكنني مساعدتك اليوم في رحلتك التعليمية؟",
    "أهلاً! جاهز لمساعدتك في أي سؤال تقني أو تعليمي. ما الذي تريد تعلمه؟",
  ],
  javascript: [
    "JavaScript هي لغة البرمجة الأكثر شيوعاً للويب. إليك أهم مفاهيمها:\n\n**1. المتغيرات:**\n```javascript\nconst name = 'Ahmed'; // ثابت\nlet age = 25; // متغير\n```\n\n**2. الدوال:**\n```javascript\nconst greet = (name) => `مرحباً ${name}!`;\nconsole.log(greet('Ahmed')); // مرحباً Ahmed!\n```\n\n**3. Promises & Async/Await:**\n```javascript\nasync function fetchData() {\n  const data = await fetch('/api/data');\n  return data.json();\n}\n```\n\nما الجانب الذي تريد التعمق فيه أكثر؟",
  ],
  react: [
    "React.js هو مكتبة JavaScript لبناء واجهات المستخدم. أساسياتها:\n\n**1. المكونات (Components):**\n```jsx\nfunction Button({ label, onClick }) {\n  return <button onClick={onClick}>{label}</button>;\n}\n```\n\n**2. الحالة (State):**\n```jsx\nconst [count, setCount] = useState(0);\n```\n\n**3. التأثيرات (Effects):**\n```jsx\nuseEffect(() => {\n  fetchUserData(); // يعمل عند التحميل\n}, []);\n```\n\nهل تريد مثالاً عملياً أكثر تفصيلاً؟",
  ],
  default: [
    "سؤال ممتاز! دعني أشرح لك هذا المفهوم بطريقة مبسطة.\n\nأولاً، المفهوم الأساسي هو أن البرمجة تعتمد على حل المشاكل بطريقة منظمة. عندما تواجه تحدياً، اتبع هذه الخطوات:\n\n1. **افهم المشكلة** — اقرأها أكثر من مرة\n2. **خطط للحل** — اكتب خوارزمية بسيطة\n3. **نفّذ الحل** — ابدأ بالجزء الأبسط\n4. **اختبر** — جرّب حالات مختلفة\n\nهل يمكنك إخباري بمزيد من التفاصيل حول ما تعمل عليه؟",
    "هذا مجال مثير للاهتمام! إليك نقاط البداية الموصى بها:\n\n• ابدأ بالمفاهيم الأساسية قبل التعمق\n• مارس يومياً ولو 30 دقيقة\n• ابنِ مشاريع حقيقية بدلاً من مجرد مشاهدة الدروس\n• انضم إلى مجتمعات المطورين\n\nما المهارة التي تريد تطويرها تحديداً؟",
  ],
};

function getMockMentorResponse(message, history = []) {
  const msg = (message || "").toLowerCase();

  if (msg.includes("مرحبا") || msg.includes("hello") || msg.includes("hi") || history.length === 0) {
    const arr = MOCK_MENTOR_RESPONSES.greeting;
    return arr[Math.floor(Math.random() * arr.length)];
  }
  if (msg.includes("javascript") || msg.includes("js") || msg.includes("جافاسكريبت")) {
    return MOCK_MENTOR_RESPONSES.javascript[0];
  }
  if (msg.includes("react") || msg.includes("ريأكت")) {
    return MOCK_MENTOR_RESPONSES.react[0];
  }

  const arr = MOCK_MENTOR_RESPONSES.default;
  return arr[Math.floor(Math.random() * arr.length)];
}

function getMockCodeReview(code, language) {
  const lines = (code || "").split("\n").length;
  const suggestions = [];

  if (code.includes("var ")) suggestions.push({ type: "warning", line: null, message: "استخدم `const` أو `let` بدلاً من `var` لتجنب مشاكل scoping." });
  if (!code.includes("//") && !code.includes("/*")) suggestions.push({ type: "info", line: null, message: "أضف تعليقات للكود لتسهيل الفهم والصيانة." });
  if (code.includes("console.log")) suggestions.push({ type: "info", line: null, message: "تذكر إزالة `console.log` قبل النشر في الإنتاج." });
  if (code.length > 500 && !code.includes("function") && !code.includes("=>")) suggestions.push({ type: "suggestion", line: null, message: "فكّر في تقسيم الكود إلى دوال أصغر وأكثر قابلية لإعادة الاستخدام." });

  const score = Math.max(60, 100 - suggestions.length * 10);

  return {
    score,
    language,
    linesAnalyzed: lines,
    summary: score >= 80
      ? "الكود بجودة جيدة مع بعض التحسينات المقترحة."
      : "الكود يعمل لكن يحتاج بعض التحسينات لجعله أكثر احترافية.",
    suggestions: suggestions.length > 0 ? suggestions : [
      { type: "success", line: null, message: "لم يتم العثور على مشاكل واضحة! الكود يبدو نظيفاً." },
    ],
    improvedCode: code, // In real AI mode, this would be the improved version
  };
}

function getMockQuiz(skill, difficulty = "medium") {
  const questions = {
    JavaScript: [
      {
        q: "ما الفرق بين `==` و `===` في JavaScript؟",
        options: [
          "لا يوجد فرق",
          "`===` يتحقق من النوع والقيمة، بينما `==` يتحقق من القيمة فقط مع تحويل النوع",
          "`==` أسرع من `===`",
          "`===` لا تعمل مع النصوص",
        ],
        answer: 1,
        explanation: "`===` (Strict Equality) يتحقق من القيمة والنوع، بينما `==` يجري تحويل النوع تلقائياً.",
      },
      {
        q: "ما الناتج: `typeof null`؟",
        options: ['"null"', '"undefined"', '"object"', '"boolean"'],
        answer: 2,
        explanation: "هذه خاصية تاريخية في JavaScript، `typeof null` ترجع `'object'` وإن كان ذلك خطأً معروفاً.",
      },
      {
        q: "ما هو Closure في JavaScript؟",
        options: [
          "دالة تُغلق البرنامج",
          "دالة تتذكر بيئتها المحيطة حتى بعد انتهاء تنفيذ الدالة الخارجية",
          "نوع من أنواع المتغيرات",
          "طريقة لتعطيل الدالة",
        ],
        answer: 1,
        explanation: "Closure هو دالة داخلية تحتفظ بإشارة لمتغيرات نطاق الدالة الخارجية.",
      },
    ],
    React: [
      {
        q: "ما الغرض من `useEffect` في React؟",
        options: [
          "لإنشاء متغيرات الحالة",
          "لتنفيذ عمليات جانبية (side effects) مثل جلب البيانات وتحديث DOM",
          "لتحسين أداء التطبيق",
          "لإنشاء مكونات جديدة",
        ],
        answer: 1,
        explanation: "`useEffect` يُستخدم لتنفيذ العمليات الجانبية مثل API calls والاشتراكات وتحديث DOM.",
      },
    ],
  };

  const skillQuestions = questions[skill] || questions.JavaScript;
  return {
    skill,
    difficulty,
    totalQuestions: skillQuestions.length,
    questions: skillQuestions.map((q, i) => ({ id: i + 1, question: q.q, options: q.options })),
    answers: skillQuestions.map((q) => ({ correct: q.answer, explanation: q.explanation })),
  };
}

function getMockCareerGuidance(profile = {}) {
  const teachSkills = profile.teachSkills || [];
  const learnSkills = profile.learnSkills || [];
  const completedSessions = profile.completedSessions || 0;

  const paths = [];

  if (teachSkills.some((s) => s.toLowerCase().includes("javascript") || s.toLowerCase().includes("react"))) {
    paths.push({
      title: "مطور واجهات أمامية أول (Senior Frontend Developer)",
      match: 92,
      salaryRange: "$50K - $120K",
      timeToAchieve: "12-18 شهراً",
      nextSteps: ["تعلم TypeScript", "إتقان اختبار الوحدات (Unit Testing)", "إنشاء مشاريع في GitHub"],
    });
  }

  if (learnSkills.some((s) => s.toLowerCase().includes("ai") || s.toLowerCase().includes("python"))) {
    paths.push({
      title: "مهندس تعلم آلي (ML Engineer)",
      match: 78,
      salaryRange: "$80K - $160K",
      timeToAchieve: "18-24 شهراً",
      nextSteps: ["إتقان Python و NumPy", "دورة في Machine Learning", "مشاريع Kaggle"],
    });
  }

  if (paths.length === 0) {
    paths.push({
      title: "مطور ويب Full Stack",
      match: 85,
      salaryRange: "$40K - $100K",
      timeToAchieve: "12-15 شهراً",
      nextSteps: ["اختر إطار عمل (React أو Vue)", "تعلم Node.js", "أنشئ مشروعاً متكاملاً"],
    });
  }

  return {
    recommendedPaths: paths,
    strengths: teachSkills.slice(0, 3),
    areasToGrow: learnSkills.slice(0, 3),
    overallProgress: Math.min(100, completedSessions * 10 + 20),
    insight: completedSessions >= 5
      ? "أنت تتقدم بشكل ممتاز! الاستمرارية هي مفتاح نجاحك."
      : "ابدأ بجلسات منتظمة مع خبراء المنصة لتسريع تقدمك.",
  };
}

function getMockSessionSummary(messages = []) {
  const totalMessages = messages.length;
  const topics = ["JavaScript", "React", "CSS", "APIs", "Git"].slice(0, Math.ceil(Math.random() * 3) + 1);

  return {
    duration: `${Math.ceil(totalMessages / 4) * 5} دقيقة`,
    topicsCovered: topics,
    keyPoints: [
      "تمت مراجعة المفاهيم الأساسية بنجاح",
      "طُبّق مثال عملي على الكود",
      "أُجيب على جميع الأسئلة المطروحة",
    ],
    actionItems: [
      `مراجعة: ${topics[0]}`,
      "تطبيق ما تعلمته في مشروع صغير",
      "حجز جلسة متابعة خلال أسبوع",
    ],
    rating: (4 + Math.random()).toFixed(1),
    recommendation: "جلسة منتجة! يُنصح بالاستمرار في التدرب يومياً.",
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function generateRoadmap(goal, userSkills = []) {
  if (AI_PROVIDER === "gemini" && GEMINI_API_KEY) {
    try {
      const prompt = `
        أنت خبير تعليمي. المستخدم يريد: "${goal}".
        مهاراته الحالية: ${userSkills.join(", ") || "مبتدئ"}.
        أنشئ خطة تعلم JSON مفصلة بالعربية تحتوي على:
        - title, estimatedWeeks, milestones (week, title, skills[]), resources, mentorSkills, careerPaths
        أجب بـ JSON فقط بدون أي نص إضافي.
      `;
      const raw = await callGemini(prompt);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) { /* fallback to mock */ }
  }
  if (AI_PROVIDER === "openai" && OPENAI_API_KEY) {
    try {
      const raw = await callOpenAI([
        { role: "system", content: "أنت خبير تعليمي. أجب دائماً بـ JSON صالح فقط." },
        { role: "user", content: `أنشئ خطة تعلم لشخص يريد: ${goal}. مهاراته: ${userSkills.join(", ")}. JSON فقط.` },
      ]);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) { /* fallback */ }
  }
  return getMockRoadmap(goal, userSkills);
}

async function getMentorChat(message, history = [], context = {}) {
  if (AI_PROVIDER === "gemini" && GEMINI_API_KEY) {
    try {
      const systemPrompt = `أنت مساعد تعليمي ذكي في منصة شارك لتبادل المهارات. 
        أجب باللغة العربية دائماً. كن ودوداً ومحترفاً. 
        ${context.skill ? `المستخدم يتعلم: ${context.skill}` : ""}
        استخدم أمثلة كود عند الحاجة بتنسيق Markdown.`;
      const conversationText = history.slice(-6).map((m) => `${m.role}: ${m.content}`).join("\n");
      const fullPrompt = conversationText ? `${conversationText}\nuser: ${message}` : message;
      return await callGemini(fullPrompt, systemPrompt);
    } catch (e) { /* fallback */ }
  }
  if (AI_PROVIDER === "openai" && OPENAI_API_KEY) {
    try {
      const messages = [
        { role: "system", content: `أنت مساعد تعليمي في منصة شارك. أجب بالعربية. ${context.skill ? `المستخدم يتعلم: ${context.skill}` : ""}` },
        ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: message },
      ];
      return await callOpenAI(messages);
    } catch (e) { /* fallback */ }
  }
  return getMockMentorResponse(message, history);
}

async function reviewCode(code, language = "javascript") {
  if (AI_PROVIDER === "gemini" && GEMINI_API_KEY) {
    try {
      const prompt = `راجع هذا الكود بلغة ${language} وأعطِ تقييماً بالعربية بتنسيق JSON:
        {score: 0-100, summary: "...", suggestions: [{type: "warning|info|suggestion|success", message: "..."}], improvedCode: "..."}
        
        الكود:
        \`\`\`${language}
        ${code}
        \`\`\`
        
        JSON فقط.`;
      const raw = await callGemini(prompt);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) return { ...JSON.parse(jsonMatch[0]), linesAnalyzed: code.split("\n").length, language };
    } catch (e) { /* fallback */ }
  }
  return getMockCodeReview(code, language);
}

async function generateQuiz(skill, difficulty = "medium") {
  if (AI_PROVIDER === "gemini" && GEMINI_API_KEY) {
    try {
      const prompt = `أنشئ 5 أسئلة اختيار من متعدد عن ${skill} بمستوى ${difficulty} بالعربية.
        تنسيق JSON: {skill, difficulty, totalQuestions, questions: [{id, question, options: []}], answers: [{correct: 0-3, explanation: ""}]}
        JSON فقط.`;
      const raw = await callGemini(prompt);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) { /* fallback */ }
  }
  return getMockQuiz(skill, difficulty);
}

async function getCareerGuidance(profile = {}) {
  if (AI_PROVIDER === "gemini" && GEMINI_API_KEY) {
    try {
      const prompt = `بناءً على هذا الملف المهني، قدّم توجيهاً مهنياً بالعربية بتنسيق JSON:
        {recommendedPaths: [{title, match: 0-100, salaryRange, timeToAchieve, nextSteps: []}], strengths: [], areasToGrow: [], overallProgress: 0-100, insight: ""}
        
        الملف: ${JSON.stringify({ teachSkills: profile.teachSkills, learnSkills: profile.learnSkills, completedSessions: profile.completedSessions })}
        JSON فقط.`;
      const raw = await callGemini(prompt);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) { /* fallback */ }
  }
  return getMockCareerGuidance(profile);
}

async function summarizeSession(messages = [], metadata = {}) {
  if (AI_PROVIDER === "gemini" && GEMINI_API_KEY && messages.length > 0) {
    try {
      const transcript = messages.slice(0, 50).map((m) => `${m.senderEmail}: ${m.text}`).join("\n");
      const prompt = `لخّص جلسة التعلم هذه بالعربية بتنسيق JSON:
        {duration: "...", topicsCovered: [], keyPoints: [], actionItems: [], rating: "0-5", recommendation: ""}
        
        النص: ${transcript}
        JSON فقط.`;
      const raw = await callGemini(prompt);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) { /* fallback */ }
  }
  return getMockSessionSummary(messages);
}

async function getSkillRecommendations(profile = {}) {
  const { teachSkills = [], learnSkills = [], completedSessions = 0 } = profile;

  // Smart rule-based recommendations
  const recommendations = [];
  const techStack = {
    JavaScript: ["React.js", "Node.js", "TypeScript", "Vue.js"],
    Python: ["Django", "FastAPI", "Data Science", "Machine Learning"],
    "UI/UX": ["Figma", "User Research", "Prototyping", "CSS Advanced"],
    React: ["TypeScript", "Next.js", "Testing", "Performance"],
    "Node.js": ["MongoDB", "PostgreSQL", "Docker", "Microservices"],
  };

  for (const skill of teachSkills) {
    const related = techStack[skill] || [];
    for (const r of related) {
      if (!teachSkills.includes(r) && !learnSkills.includes(r)) {
        recommendations.push({
          skill: r,
          reason: `بناءً على خبرتك في ${skill}`,
          confidence: Math.floor(75 + Math.random() * 20),
          type: "complementary",
        });
      }
    }
  }

  // Add trending skills
  const trending = ["AI/ML", "Next.js", "Docker", "TypeScript", "Rust"];
  for (const t of trending) {
    if (!teachSkills.includes(t) && !learnSkills.includes(t) && recommendations.length < 8) {
      recommendations.push({
        skill: t,
        reason: "مهارة رائجة في سوق العمل حالياً",
        confidence: Math.floor(60 + Math.random() * 25),
        type: "trending",
      });
    }
  }

  return recommendations.slice(0, 6);
}

module.exports = {
  generateRoadmap,
  getMentorChat,
  reviewCode,
  generateQuiz,
  getCareerGuidance,
  summarizeSession,
  getSkillRecommendations,
  provider: AI_PROVIDER,
};
