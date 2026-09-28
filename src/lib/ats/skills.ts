/**
 * Curated skills dictionary used for deterministic keyword extraction.
 * Format: "Canonical name|alias|alias". Matching is case-insensitive.
 * Extend freely — nothing else needs to change.
 */
export type SkillCategory = "technical" | "tool" | "soft" | "certification" | "domain";

const TECHNICAL = [
  "JavaScript|js|ecmascript", "TypeScript|ts", "Python", "Java", "C#|c sharp|csharp", "C++|cpp", "C", "Go|golang", "Rust", "Ruby", "PHP", "Swift", "Kotlin",
  "Scala", "R", "MATLAB", "Perl", "Dart", "Elixir", "Haskell", "Objective-C", "Bash|shell scripting", "PowerShell", "SQL", "NoSQL", "GraphQL", "HTML|html5", "CSS|css3",
  "Sass|scss", "Tailwind CSS|tailwind|tailwindcss", "React|react.js|reactjs", "Next.js|nextjs", "Vue|vue.js|vuejs", "Nuxt|nuxt.js", "Angular|angularjs", "Svelte|sveltekit",
  "Redux", "React Native", "Flutter", "Node.js|node|nodejs", "Express|express.js|expressjs", "NestJS|nest.js", "Django", "Flask", "FastAPI", "Spring|spring boot|springboot",
  ".NET|dotnet|asp.net|.net core", "Ruby on Rails|rails", "Laravel", "jQuery", "REST APIs|rest|restful|rest api|restful apis", "gRPC", "WebSockets|websocket",
  "Microservices|microservice", "Serverless", "Event-driven architecture|event driven", "Distributed systems", "System design", "Data structures", "Algorithms",
  "Object-oriented programming|oop|object oriented", "Functional programming", "Test-driven development|tdd", "Unit testing|unit tests", "Integration testing",
  "End-to-end testing|e2e testing|e2e", "Jest", "Vitest", "Cypress", "Playwright", "Selenium", "Mocha", "JUnit", "pytest", "Machine learning|ml", "Deep learning",
  "Natural language processing|nlp", "Computer vision", "Data analysis|data analytics", "Data science", "Data engineering", "ETL|elt", "Data modeling|data modelling",
  "Statistics|statistical analysis", "A/B testing|ab testing|experimentation", "TensorFlow", "PyTorch", "scikit-learn|sklearn", "Pandas", "NumPy", "Spark|apache spark|pyspark",
  "Hadoop", "Kafka|apache kafka", "Airflow|apache airflow", "dbt", "LLMs|large language models|llm", "Prompt engineering", "PostgreSQL|postgres", "MySQL", "SQLite",
  "Microsoft SQL Server|sql server|mssql", "Oracle Database|oracle db", "MongoDB|mongo", "Redis", "Elasticsearch|elastic search", "DynamoDB", "Cassandra", "Snowflake",
  "BigQuery", "Redshift", "Firebase", "Supabase", "AWS|amazon web services", "Azure|microsoft azure", "Google Cloud|gcp|google cloud platform", "Docker|containers",
  "Kubernetes|k8s", "Terraform", "Ansible", "Helm", "CI/CD|ci cd|continuous integration|continuous delivery|continuous deployment", "DevOps", "Linux|unix",
  "Networking|tcp/ip", "Security|cybersecurity|information security", "OAuth|oauth2", "Authentication", "Encryption", "Penetration testing|pen testing",
  "Accessibility|a11y|wcag", "Performance optimization", "Responsive design", "UI design|user interface design", "UX design|user experience", "Web development",
  "Mobile development", "iOS", "Android", "Embedded systems", "Blockchain", "Solidity", "Unity", "Unreal Engine", "Webpack", "Vite", "Babel", "Storybook",
  "Design systems", "Observability", "Monitoring", "Logging", "Prometheus", "Grafana", "Datadog", "New Relic", "Sentry", "Nginx", "Apache", "Git|github|gitlab|bitbucket",
  "Agile|agile methodology", "Scrum", "Kanban", "Lean", "Six Sigma", "SEO|search engine optimization", "SEM", "Google Analytics", "Excel|microsoft excel|advanced excel",
  "Power BI|powerbi", "Tableau", "Looker", "Financial modeling|financial modelling", "Forecasting", "Budgeting", "Accounting", "Bookkeeping", "Auditing|audit",
  "Tax preparation", "Payroll", "Risk management", "Compliance", "GAAP", "IFRS", "Supply chain|supply chain management", "Logistics", "Procurement", "Inventory management",
  "Project management", "Program management", "Product management", "Stakeholder management", "Change management", "Vendor management", "Budget management",
  "Customer service", "Customer success", "Account management", "Sales", "Business development", "Lead generation", "CRM", "Marketing", "Digital marketing",
  "Content marketing", "Social media marketing|social media", "Email marketing", "Copywriting", "Content writing", "Technical writing", "Public relations|pr",
  "Market research", "Brand management|branding", "Graphic design", "Illustration", "Video editing", "Photography", "Recruiting|recruitment|talent acquisition",
  "Onboarding", "Employee relations", "Training and development|training", "Operations management|operations", "Quality assurance|qa", "Quality control",
  "Data entry", "Research", "Teaching", "Curriculum development", "Nursing", "Patient care", "Clinical research", "Healthcare", "Legal research", "Contract negotiation",
];

const TOOLS = [
  "Jira", "Confluence", "Trello", "Asana", "Notion", "Slack", "Figma", "Sketch", "Adobe XD", "Photoshop|adobe photoshop", "Illustrator|adobe illustrator",
  "InDesign|adobe indesign", "Premiere Pro|adobe premiere", "After Effects", "Canva", "Salesforce", "HubSpot", "Zendesk", "SAP", "Oracle", "QuickBooks", "Xero",
  "Workday", "ServiceNow", "Microsoft Office|ms office|office 365|microsoft 365", "Google Workspace|g suite", "PowerPoint", "Word|microsoft word", "Postman",
  "VS Code|visual studio code", "Visual Studio", "IntelliJ", "Xcode", "Android Studio", "Jenkins", "GitHub Actions", "CircleCI", "Travis CI", "Vercel", "Netlify",
  "Heroku", "Cloudflare", "Stripe", "Shopify", "WordPress", "Magento", "Zapier", "Airtable", "Mixpanel", "Amplitude", "Segment", "Hotjar", "Optimizely",
];

const SOFT = [
  "Communication|communication skills|verbal communication|written communication", "Leadership|team leadership", "Teamwork|collaboration|collaborative",
  "Problem solving|problem-solving", "Critical thinking", "Time management", "Attention to detail|detail-oriented|detail oriented", "Adaptability|adaptable",
  "Creativity|creative", "Mentoring|mentorship|coaching", "Negotiation", "Presentation skills|presenting|public speaking", "Organization|organizational skills",
  "Decision making|decision-making", "Conflict resolution", "Customer focus|customer-focused", "Ownership", "Self-motivated|self-starter", "Analytical skills|analytical",
  "Cross-functional collaboration|cross-functional", "Strategic planning|strategy", "Prioritization", "Multitasking", "Empathy", "Interpersonal skills",
];

const CERTIFICATIONS = [
  "AWS Certified|aws certification|aws certified solutions architect", "Azure Certified|azure certification", "Google Cloud Certified", "PMP|project management professional",
  "CAPM", "PRINCE2", "Certified ScrumMaster|csm|scrum master certification", "PSM", "CISSP", "CISM", "CompTIA Security+|security+", "CompTIA A+", "CCNA", "CPA",
  "CFA", "ACCA", "CMA", "SHRM-CP|shrm", "Lean Six Sigma|six sigma green belt|six sigma black belt", "ITIL", "CKA|certified kubernetes administrator",
];

export interface SkillEntry {
  name: string;
  aliases: string[];
  category: SkillCategory;
}

function build(list: string[], category: SkillCategory): SkillEntry[] {
  return list.map((line) => {
    const [name, ...aliases] = line.split("|");
    return { name, aliases, category };
  });
}

export const SKILLS: SkillEntry[] = [
  ...build(TECHNICAL, "technical"),
  ...build(TOOLS, "tool"),
  ...build(SOFT, "soft"),
  ...build(CERTIFICATIONS, "certification"),
];

/** Single-letter / ambiguous names that need context to count as a skill. */
export const AMBIGUOUS = new Set(["C", "R", "Go", "Word", "Oracle", "Apache", "Sales", "Research", "Security", "Next.js", "Lean", "Spring", "Express", "Swift", "Rust", "Unity", "Operations", "Organization", "Ownership", "Creativity", "Training and development"]);
