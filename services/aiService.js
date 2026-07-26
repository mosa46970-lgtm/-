/**
 * Sharik AI Service
 * Unified AI layer supporting: Gemini, OpenAI, or intelligent NLP mode.
 * Set AI_PROVIDER=gemini|openai|mock in .env
 * Set GEMINI_API_KEY or OPENAI_API_KEY accordingly.
 */

const AI_PROVIDER = process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY ? "gemini" : process.env.OPENAI_API_KEY ? "openai" : "mock");
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

// ─── Dedicated Custom Roadmap Engine ─────────────────────────────────────────
function getMockRoadmap(goal, userSkills = []) {
  const goalLower = (goal || "").toLowerCase();

  let title = "مسار تعلم مخصص";
  let estimatedWeeks = 16;
  let milestones = [];
  let resources = [];
  let mentorSkills = [];

  if (goalLower.includes("ai") || goalLower.includes("ذكاء") || goalLower.includes("machine") || goalLower.includes("تعلم آلي")) {
    title = "مسار مهندس الذكاء الاصطناعي (AI & Machine Learning Engineer)";
    estimatedWeeks = 20;
    milestones = [
      { week: 1, title: "1. أساسيات البايثون والرياضيات البرمجية", skills: ["Python 3.11+", "Linear Algebra", "Calculus & Probability", "Git & Jupyter"], completed: false },
      { week: 4, title: "2. معالجة وتحليل البيانات الضخمة", skills: ["NumPy", "Pandas", "Data Cleaning", "Matplotlib & Seaborn"], completed: false },
      { week: 8, title: "3. خوارزميات التعلم الآلي (Machine Learning)", skills: ["Supervised Learning", "Classification & Regression", "scikit-learn", "Model Evaluation"], completed: false },
      { week: 12, title: "4. التعلم العميق والشبكات العصبية", skills: ["Deep Learning Fundamentals", "PyTorch / TensorFlow", "CNNs for Vision", "Transformers & NLP"], completed: false },
      { week: 16, title: "5. نماذج اللغة الكبيرة وتقنيات RAG", skills: ["LLMs & Prompt Engineering", "LangChain & RAG Frameworks", "Vector Databases (ChromaDB)", "FastAPI Integration"], completed: false },
      { week: 20, title: "6. نشر وتدريب النماذج MLOps", skills: ["MLOps Pipeline", "Docker Packaging", "Cloud Deployment (AWS/Railway)", "Model Monitoring"], completed: false },
    ];
    resources = [
      { title: "DeepLearning.AI - AI Courses", url: "https://www.deeplearning.ai", type: "course" },
      { title: "Kaggle Datasets & Competitions", url: "https://www.kaggle.com", type: "tutorial" },
      { title: "Fast.ai Practical Deep Learning", url: "https://www.fast.ai", type: "course" },
    ];
    mentorSkills = ["Python", "Machine Learning", "PyTorch", "Deep Learning", "FastAPI"];
  }
  else if (goalLower.includes("frontend") || goalLower.includes("واجهات أمامية") || goalLower.includes("ريأكت") || goalLower.includes("react")) {
    title = "مسار مطور واجهات أمامية (Frontend Developer)";
    estimatedWeeks = 14;
    milestones = [
      { week: 1, title: "1. أساسيات الهيكلة والتنسيق المتقدم", skills: ["HTML5 Semantic", "CSS3 Flexbox & Grid", "Responsive Web Design", "Git & GitHub"], completed: false },
      { week: 3, title: "2. البرمجة التفاعلية بـ JavaScript", skills: ["JavaScript ES6+", "DOM Manipulation", "Fetch API & Async/Await", "JSON"], completed: false },
      { week: 6, title: "3. إطار العمل الأساسي React.js", skills: ["React Components", "JSX Syntax", "useState & useEffect", "React Router"], completed: false },
      { week: 9, title: "4. البرمجة القوية والتنسيق الحديث", skills: ["TypeScript Fundamentals", "Tailwind CSS", "State Management (Redux/Zustand)", "Formik & Yup"], completed: false },
      { week: 12, title: "5. بناء تطبيقات الأداء العالي", skills: ["Next.js App Router", "Server-Side Rendering (SSR)", "API Integration", "Performance Audit"], completed: false },
      { week: 14, title: "6. المشروع التطبيقي والنشر", skills: ["Unit Testing (Jest)", "Responsive Portfolio", "Deployment (Vercel)", "CI/CD Actions"], completed: false },
    ];
    resources = [
      { title: "MDN Web Docs - Frontend", url: "https://developer.mozilla.org", type: "documentation" },
      { title: "React Official Docs", url: "https://react.dev", type: "documentation" },
      { title: "JavaScript.info", url: "https://javascript.info", type: "tutorial" },
    ];
    mentorSkills = ["JavaScript", "React.js", "TypeScript", "Next.js", "Tailwind CSS"];
  }
  else if (goalLower.includes("backend") || goalLower.includes("خلفي") || goalLower.includes("سيرفر")) {
    title = "مسار مطور الواجهات الخلفية (Backend Developer)";
    estimatedWeeks = 16;
    milestones = [
      { week: 1, title: "1. بيئة التشغيل ولغة السيرفر", skills: ["Node.js / Python", "Event Loop & Async I/O", "Package Managers", "Linux Terminal"], completed: false },
      { week: 4, title: "2. بناء برمجيات RESTful APIs", skills: ["Express.js / FastAPI", "Routing & Controllers", "Middleware & Error Handling", "REST Best Practices"], completed: false },
      { week: 7, title: "3. قواعد البيانات الهيكلية والأنماط", skills: ["PostgreSQL / MongoDB", "SQL Queries & Indexing", "ORMs (Prisma / Mongoose)", "Database Modeling"], completed: false },
      { week: 10, title: "4. الأمان وتوثيق الهوية", skills: ["JWT Authentication", "OAuth 2.0", "bcrypt Password Hashing", "Rate Limiting & CORS"], completed: false },
      { week: 13, title: "5. المعمارية والتخزين المؤقت", skills: ["Redis Caching", "Message Queues (RabbitMQ)", "Microservices Architecture", "Docker Containerization"], completed: false },
      { week: 16, title: "6. الاختبار والنشر المستمر", skills: ["Unit & Integration Testing", "Swagger/OpenAPI Specs", "CI/CD Pipelines", "Deployment (Railway/AWS)"], completed: false },
    ];
    resources = [
      { title: "Node.js Official Documentation", url: "https://nodejs.org", type: "documentation" },
      { title: "PostgreSQL Tutorial", url: "https://www.postgresqltutorial.com", type: "tutorial" },
    ];
    mentorSkills = ["Node.js", "Express.js", "MongoDB", "PostgreSQL", "Docker"];
  }
  else if (goalLower.includes("ui") || goalLower.includes("ux") || goalLower.includes("تصميم")) {
    title = "مسار مصمم تجربة وواجهة المستخدم (UI/UX Designer)";
    estimatedWeeks = 12;
    milestones = [
      { week: 1, title: "1. أساسيات التفكير التصميمي والبحث", skills: ["User Research Methods", "User Personas", "Empathy Maps", "Information Architecture"], completed: false },
      { week: 3, title: "2. تخطيط الهيكل والهياكل السلكية", skills: ["Wireframing", "User Flows", "Low-Fidelity Prototyping", "Whimsical & Figma"], completed: false },
      { week: 6, title: "3. الاحتراف في أدوات Figma", skills: ["Figma Components", "Auto-Layout", "Design Systems", "Typography & Color Theory"], completed: false },
      { week: 8, title: "4. التفاعل الحركي والنمذجة عالية الدقة", skills: ["High-Fidelity Prototyping", "Micro-interactions", "Interactive Testing", "Accessibility (WCAG)"], completed: false },
      { week: 10, title: "5. اختبار القابلية والتسليم للمطورين", skills: ["Usability Testing", "Design Tokens", "Developer Handoff", "Figma Inspection"], completed: false },
      { week: 12, title: "6. معرض الأعمال والتأهيل المهني", skills: ["Portfolio Case Studies", "Behance & Dribbble", "Design Presentation"], completed: false },
    ];
    resources = [
      { title: "Figma Academy & Guides", url: "https://www.figma.com/education", type: "documentation" },
      { title: "Nielsen Norman Group UX Articles", url: "https://www.nngroup.com", type: "tutorial" },
    ];
    mentorSkills = ["Figma", "UI Design", "UX Research", "Design Systems", "Prototyping"];
  }
  else if (goalLower.includes("cyber") || goalLower.includes("أمن") || goalLower.includes("اختراق") || goalLower.includes("سيبراني")) {
    title = "مسار أخصائي أمن المعلومات والأنظمة (Cybersecurity Specialist)";
    estimatedWeeks = 18;
    milestones = [
      { week: 1, title: "1. شبكات الكمبيوتر والأنظمة", skills: ["CompTIA Network+", "TCP/IP Suite", "Linux System Admin", "Bash Scripting"], completed: false },
      { week: 4, title: "2. أساسيات الأمان والتشفير", skills: ["Cryptography (AES/RSA)", "PKI & Digital Certificates", "Firewalls & VPNs", "Security Policies"], completed: false },
      { week: 8, title: "3. أمن تطبيقات الويب", skills: ["OWASP Top 10", "Burp Suite", "SQL Injection & XSS", "Session Hijacking"], completed: false },
      { week: 12, title: "4. اختبار الاختراق والأجهزة", skills: ["Penetration Testing", "Metasploit Framework", "Nmap & Wireshark", "Kali Linux"], completed: false },
      { week: 15, title: "5. التحليل الجنائي والاستجابة للحوادث", skills: ["Digital Forensics", "Incident Response", "SIEM Tools (Splunk)", "Malware Analysis Basics"], completed: false },
      { week: 18, title: "6. التقارير والشهادات المعتمدة", skills: ["Security Auditing", "Compliance (ISO 27001)", "Pentest Report Writing"], completed: false },
    ];
    resources = [
      { title: "TryHackMe Learning Paths", url: "https://tryhackme.com", type: "course" },
      { title: "Hack The Box", url: "https://www.hackthebox.com", type: "tutorial" },
    ];
    mentorSkills = ["Cybersecurity", "Ethical Hacking", "Linux", "Penetration Testing", "Network Security"];
  }
  else {
    title = `مسار تخصصي: ${goal}`;
    estimatedWeeks = 16;
    milestones = [
      { week: 1, title: "1. الإعداد وأساسيات التخصص", skills: [`أساسيات ${goal}`, "إعداد أدوات العمل", "إدارة الإصدارات والملاحظات"], completed: false },
      { week: 4, title: "2. المفاهيم المحورية والعملية", skills: [`تطبيق المفاهيم المركزية لـ ${goal}`, "بناء الأمثلة الصغيرة", "حل المشاكل الأولية"], completed: false },
      { week: 8, title: "3. التقنيات المتقدمة وأفضل الممارسات", skills: ["معايير الجودة والأداء", "استخدام المكتبات والمجموعات المتخصصة", "الربط مع الخدمات المجاورة"], completed: false },
      { week: 11, title: "4. المعمارية والتكامل", skills: ["البنية التحتية والتنسيق", "إدارة البيانات والأمان", "الأتمتة والاختبارات"], completed: false },
      { week: 14, title: "5. المشروع التطبيقي الشامل", skills: ["بناء تطبيق حقيقي من الصفر", "معالجة الحالات الاستثنائية", "تحسين الأداء والتجربة"], completed: false },
      { week: 16, title: "6. الإطلاق والتجهيز لسوق العمل", skills: ["توثيق المشروع", "إعداد معرض الأعمال Portfolio", "التحضير للمقابلات التقنية"], completed: false },
    ];
    resources = [
      { title: "MDN & Official Guides", url: "https://developer.mozilla.org", type: "documentation" },
      { title: "GitHub Community Guides", url: "https://github.com", type: "tutorial" },
    ];
    mentorSkills = [goal, "التطوير التقني", "حل المشكلات"];
  }

  if (userSkills.length > 0) {
    milestones[0].completed = true;
  }

  return { title, estimatedWeeks, milestones, resources, mentorSkills };
}

// ─── Intelligent NLP Engine for Chat ─────────────────────────────────────────
function getMockMentorResponse(message, history = [], context = {}) {
  const rawMsg = (message || "").trim();
  const msg = rawMsg.toLowerCase();

  const isGreeting = /^(أهلا|أهلاً|اهلا|مرحبا|مرحباً|سلام|السلام عليكم|ازيك|كيفك|شلونك|مساء الخير|صباح الخير|من انت|مين انت|من أنت|hi|hello|hey|greetings)/i.test(msg) ||
                     msg === "اهلا" || msg === "أهلا" || msg === "مرحبا" || msg === "سلام" || msg === "هاي";

  if (isGreeting) {
    if (msg.includes("من انت") || msg.includes("مين انت") || msg.includes("من أنت")) {
      return "أنا **المساعد الذكي لمنصة شارك** 🤖! أساعدك في إجابة الأسئلة التقنية، شرح لغات البرمجة، مراجعة وتصحيح الكود البرمجي، واقتراح مسارات التعلم والمطابقة مع المرشدين. كيف يمكنني مساعدتك اليوم؟";
    }
    return `أهلاً وسهلاً بك! 👋 أنا مساعدك الذكي في منصة **شارك**.

يمكنني مساعدتك في:
1. 💡 **إجابة الأسئلة التقنية** والبرمجية.
2. 🔍 **مراجعة وتعديل كودك البرمجي**.
3. 🗺️ **إنشاء خطة تعلم مخصصة** لمهارتك المستهدفة.
4. 🧪 **توليد اختبارات تفاعلية** لقياس مستواك.

ما الموضوع أو المهارة التي تريد مناقشتها الآن؟`;
  }

  if (msg.includes("شارك") || msg.includes("مطابقة") || msg.includes("مرشد") || msg.includes("جلسة") || msg.includes("تبادل")) {
    return `منصة **شارك (Sharik)** هي منصة لتبادل المهارات بين المتعلمين والخبراء.

إليك أهم خطوتين للبدء:
- 🤝 **المطابقة الذكية (`/login-signup/matching-results.html`)**: تجد خبيراً يمتلك المهارة التي تريد تعلمها ويريد تعلم المهارة التي تتقنها.
- 📅 **حجز جلسة (`/app/sessions.html`)**: تختار الوقت واليوم المناسبين لحجز جلسة تعليمية متبادلة مع المرشد.

هل تريد نصائح للتحضير لأول جلسة لك؟`;
  }

  if (msg.includes("async") || msg.includes("await") || msg.includes("promise")) {
    return `مفهوم **Async/Await** في JavaScript يُستخدم للتعامل مع العمليات غير المتزامنة (Asynchronous) بكتابة كود يبدو متزامناً ونظيفاً:

**1. مثال باستخدام Promises:**
\`\`\`javascript
function fetchUser() {
  return fetch('/api/user')
    .then(res => res.json())
    .then(user => console.log(user))
    .catch(err => console.error(err));
}
\`\`\`

**2. نفس المثال باستخدام Async/Await:**
\`\`\`javascript
async function fetchUser() {
  try {
    const res = await fetch('/api/user');
    const user = await res.json();
    console.log('بيانات المستخدم:', user);
  } catch (err) {
    console.error('حدث خطأ:', err);
  }
}
\`\`\`

💡 **نصيحة:** استخدم دائماً \`try...catch\` مع \`await\` للتعامل مع الأخطاء بأمان!`;
  }

  if (msg.includes("javascript") || msg.includes("js") || msg.includes("جافاسكريبت") || msg.includes("closure")) {
    return `لغة **JavaScript** هي لغة البرمجة الأساسية لتطوير الويب الحديث.

**أهم مفاهيمها الأساسية:**
- **Variables:** \`const\` للقيم الثابتة و \`let\` للمتغيرات.
- **Closure:** قدرة الدالة على تذكر المتغيرات من نطاقها الخارجي حتى بعد انتهاء تنفيذها:
\`\`\`javascript
function createCounter() {
  let count = 0;
  return function() {
    count++;
    return count;
  };
}
const counter = createCounter();
console.log(counter()); // 1
console.log(counter()); // 2
\`\`\`

ما المفهوم الذي تريد تعميق معرفتك فيه في JavaScript؟`;
  }

  if (msg.includes("react") || msg.includes("ريأكت") || msg.includes("component") || msg.includes("next")) {
    return `مكتبة **React.js** تُعتبر المعيار الحالي لبناء واجهات المستخدم التفاعلية (UI).

**أهم المفاهيم في React:**
1. **Components (المكونات):** لبناء الواجهة كقطع صغيرة قابلة لإعادة الاستخدام.
2. **useState:** لإدارة حالة البيانات المحلية:
\`\`\`jsx
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount(count + 1)}>
      العدد: {count}
    </button>
  );
}
\`\`\`
3. **useEffect:** لتنفيذ العمليات الجانبية مثل جلب البيانات من السيرفر.

هل تود معرفة أفضل الممارسات في تنظيم مشاريع React؟`;
  }

  if (msg.includes("docker") || msg.includes("دوكر") || msg.includes("container")) {
    return `تقنية **Docker** تُتيح تغليف تطبيقك مع جميع ملحقاته وبيئته التشغيلية داخل كبسولة مستقلة يُطلق عليها **Container**.

**فوائد Docker الرئيسية:**
- 🚀 **عمل التطبيق بانتظام:** يعمل بنفس الكفاءة على جهازك الشخصي وسيرفر الإنتاج.
- 📦 **سهولة التوزيع:** ملف \`Dockerfile\` واحد يحدد كل ما يحتاجه المشروع:
\`\`\`dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
\`\`\`

هل تريد معرفة كيفية كتابة ملف \`docker-compose.yml\` لمشروعك؟`;
  }

  if (msg.includes("python") || msg.includes("بايثون") || msg.includes("machine learning") || msg.includes("ai")) {
    return `لغة **Python** هي اللغة الأكثر شعبية لتطوير تطبيقات الذكاء الاصطناعي وتحليل البيانات والـ Backend.

**أهم مكتبات الذكاء الاصطناعي في Python:**
- 📊 **NumPy & Pandas:** لعمليات مصفوفات البيانات والجداول.
- 🤖 **scikit-learn:** لخوارزميات التعلم الآلي التقليدية.
- 🧠 **PyTorch & TensorFlow:** للشبكات العصبية والتعلم العميق.

مثال سريع على استخدام Python لتجهيز البيانات:
\`\`\`python
import pandas as pd

data = {'Skill': ['Python', 'React', 'Docker'], 'Demand': [95, 88, 82]}
df = pd.DataFrame(data)
print(df.describe())
\`\`\`

هل لديك استفسار محدد في بايثون أو الذكاء الاصطناعي؟`;
  }

  if (msg.includes("sql") || msg.includes("database") || msg.includes("mongodb") || msg.includes("قواعد بيانات")) {
    return `إدارة **قواعد البيانات (Databases)** تنقسم إلى نوعين أساسيين:

1. **Relational SQL (مثل PostgreSQL / MySQL):**
   تعتمد على الجداول والعلاقات وتتميز بالدقة العالية (ACID Compliance):
   \`\`\`sql
   SELECT users.name, skills.title 
   FROM users 
   JOIN skills ON users.id = skills.user_id;
   \`\`\`

2. **NoSQL (مثل MongoDB):**
   تعتمد على مستندات JSON وتتميز بالمرونة العالية والسرعة في التوسع.

هل تود معرفة أيهما أفضل لمشروعك الحالي؟`;
  }

  return `شكرًا على سؤالك حول **"${rawMsg.slice(0, 60)}"**! 💡

للتعامل مع هذا الموضوع بأفضل طريقة برمجية:

1. 📌 **الفهم المفهومي:** تأكد من تحديد الهدف الأساسي والقيم المدخلة والمخرجة المتوقعة.
2. 🛠️ **أفضل الممارسات:** اكتب كوداً نظيفاً (Clean Code)، متبّعاً مبادئ البرمجة المنظمة مثل DRY (Don't Repeat Yourself).
3. 🧪 **الاختبار:** اختبر الحالات الاستثنائية (Edge Cases) لضمان استقرار التطبيق.

إذا كان لديك جزء كود محدد تريد مراجعته أو تعديله، يمكنك لصقه هنا أو الانتقال إلى تبويب **"مراجعة الكود"** 🔍.`;
}

function getMockCodeReview(code, language) {
  const lines = (code || "").split("\n").length;
  const suggestions = [];

  if (code.includes("var ")) suggestions.push({ type: "warning", message: "استخدم `const` أو `let` بدلاً من `var` لتجنب نطاقات السكوب غير المتوقعة." });
  if (!code.includes("//") && !code.includes("/*")) suggestions.push({ type: "info", message: "أضف تعليقات توضيحية للوظائف الرئيسية داخل الكود." });
  if (code.includes("console.log")) suggestions.push({ type: "info", message: "تذكر تصفية عبارات `console.log` قبل رفع المشروع للإنتاج." });
  if (code.length > 500 && !code.includes("function") && !code.includes("=>")) suggestions.push({ type: "suggestion", message: "قسم الكود لدوائر وكتل أصغر سهلة الصيانة والإعادة." });

  const score = Math.max(65, 100 - suggestions.length * 10);

  return {
    score,
    language,
    linesAnalyzed: lines,
    summary: score >= 80 ? "الكود مكتوب بجودة ممتازة مع بعض الملاحظات البسيطة:" : "الكود يعمل ولكنه يحتاج لمراعاة معايير الكود النظيف التالية:",
    suggestions: suggestions.length > 0 ? suggestions : [
      { type: "success", message: "الكود مكتوب وفق أفضل الممارسات ونظيف تماماً! ✅" },
    ],
    improvedCode: code,
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
        explanation: "`===` (Strict Equality) يتحقق من القيمة والنوع دون تحويل أنماط البيانات تلقائياً.",
      },
      {
        q: "ما الناتج: `typeof null`؟",
        options: ['"null"', '"undefined"', '"object"', '"boolean"'],
        answer: 2,
        explanation: "في JavaScript يُرجع `typeof null` القيمة `'object'` بظاهرة تاريخية معروفة.",
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
        explanation: "`useEffect` يُستخدم لتنفيذ العمليات الجانبية مثل جلب البيانات وتحديث الصفحة.",
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

  const paths = [
    {
      title: "مطور واجهات أمامية (Senior Frontend Developer)",
      match: 92,
      salaryRange: "$50K - $110K",
      timeToAchieve: "12 شهراً",
      nextSteps: ["إتقان TypeScript", "اختبار الوحدات Unit Testing", "بناء Portfolio مميز"],
    },
    {
      title: "مطور تطبيقات متكامل (Fullstack Engineer)",
      match: 85,
      salaryRange: "$60K - $130K",
      timeToAchieve: "14 شهراً",
      nextSteps: ["تعلم Node.js & Express", "قواعد بيانات MongoDB", "CI/CD & Cloud Deployment"],
    }
  ];

  return {
    recommendedPaths: paths,
    strengths: teachSkills.length ? teachSkills.slice(0, 3) : ["تعلم سريع", "حل المشكلات"],
    areasToGrow: learnSkills.length ? learnSkills.slice(0, 3) : ["Node.js", "Docker"],
    overallProgress: Math.min(100, completedSessions * 15 + 35),
    insight: "أنت تسير في المسار الصحيح! الاستمرارية في تطبيق المشاريع العملية سترفع من فرض التبادل بشكل كبير.",
  };
}

function getMockSessionSummary(messages = []) {
  return {
    duration: "45 دقيقة",
    topicsCovered: ["JavaScript", "React", "State Management"],
    keyPoints: ["تمت مراجعة الأساسيات", "تطبيق مثال عملي على الكود"],
    actionItems: ["تطبيق التمرين المستلم", "حجز جلسة قادمة"],
    rating: "4.9",
    recommendation: "جلسة مثمرة جداً ومستفيضة!",
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function generateRoadmap(goal, userSkills = []) {
  if (AI_PROVIDER === "gemini" && GEMINI_API_KEY) {
    try {
      const prompt = `أنت خبير تعليمي. المستخدم يريد: "${goal}". مهاراته: ${userSkills.join(", ")}. أنشئ خطة تعلم JSON مفصلة بالعربية تحتوي على: title, estimatedWeeks, milestones (week, title, skills[]), resources, mentorSkills. JSON فقط.`;
      const raw = await callGemini(prompt);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {}
  }
  return getMockRoadmap(goal, userSkills);
}

async function getMentorChat(message, history = [], context = {}) {
  if (AI_PROVIDER === "gemini" && GEMINI_API_KEY) {
    try {
      const systemPrompt = `أنت المساعد الذكي في منصة شارك لتبادل المهارات. أجب باللغة العربية دائماً وبإجابات دقيقة واحترافية وفقاً لـ Markdown.`;
      const conversationText = history.slice(-6).map((m) => `${m.role}: ${m.content}`).join("\n");
      const fullPrompt = conversationText ? `${conversationText}\nuser: ${message}` : message;
      const res = await callGemini(fullPrompt, systemPrompt);
      if (res) return res;
    } catch (e) {}
  }
  return getMockMentorResponse(message, history, context);
}

async function reviewCode(code, language = "javascript") {
  if (AI_PROVIDER === "gemini" && GEMINI_API_KEY) {
    try {
      const prompt = `راجع هذا الكود بلغة ${language} وأعطِ تقييماً بالعربية بتنسيق JSON: {score: 0-100, summary: "...", suggestions: [{type: "warning|info|suggestion|success", message: "..."}], improvedCode: "..."} الكود: \`\`\`${language}\n${code}\n\`\`\` JSON فقط.`;
      const raw = await callGemini(prompt);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) return { ...JSON.parse(jsonMatch[0]), linesAnalyzed: code.split("\n").length, language };
    } catch (e) {}
  }
  return getMockCodeReview(code, language);
}

async function generateQuiz(skill, difficulty = "medium") {
  if (AI_PROVIDER === "gemini" && GEMINI_API_KEY) {
    try {
      const prompt = `أنشئ 5 أسئلة اختيار من متعدد عن ${skill} بمستوى ${difficulty} بالعربية. تنسيق JSON: {skill, difficulty, totalQuestions, questions: [{id, question, options: []}], answers: [{correct: 0-3, explanation: ""}]} JSON فقط.`;
      const raw = await callGemini(prompt);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {}
  }
  return getMockQuiz(skill, difficulty);
}

async function getCareerGuidance(profile = {}) {
  return getMockCareerGuidance(profile);
}

async function summarizeSession(messages = [], metadata = {}) {
  return getMockSessionSummary(messages);
}

async function getSkillRecommendations(profile = {}) {
  return [
    { skill: "AI & Data Science", reason: "مهارة عالية الطلب في سوق العمل", confidence: 95, type: "trending" },
    { skill: "Next.js & Fullstack Web", reason: "تناسب اهتماماتك وتزيد فرض المطابقة", confidence: 88, type: "complementary" },
    { skill: "Docker & Cloud Security", reason: "مرغوبة في تبادل المهارات التخصصية", confidence: 82, type: "trending" }
  ];
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
