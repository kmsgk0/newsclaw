ALTER TABLE editors ADD COLUMN memory_revision bigint NOT NULL DEFAULT 0;
CREATE TABLE skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE, owner_id uuid REFERENCES users(id) ON DELETE CASCADE,
  personal_source_id uuid, kind text NOT NULL CHECK(kind IN ('explain','comparison','brief','mindmap','bilingual')),
  name text NOT NULL, description text NOT NULL, instructions text NOT NULL, output_format text NOT NULL,
  example text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published','unlisted')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE user_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES skills(id), kind text NOT NULL, name text NOT NULL, instructions text NOT NULL,
  output_format text NOT NULL, enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,template_id)
);
ALTER TABLE skills ADD CONSTRAINT skills_personal_source_fk FOREIGN KEY(personal_source_id) REFERENCES user_skills(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX skills_personal_publication ON skills(personal_source_id) WHERE personal_source_id IS NOT NULL;
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL, context jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_user_recent ON conversations(user_id,updated_at DESC,id);
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('user','assistant')), content text NOT NULL DEFAULT '',
  status text NOT NULL CHECK(status IN ('pending','completed','failed')), sources jsonb NOT NULL DEFAULT '[]',
  skill_id uuid REFERENCES user_skills(id) ON DELETE SET NULL, artifact jsonb, usage jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE INDEX messages_conversation ON messages(conversation_id,created_at,id);
CREATE UNIQUE INDEX messages_one_pending ON messages(conversation_id) WHERE status='pending';
CREATE TABLE memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key text NOT NULL, content text NOT NULL, origin text NOT NULL CHECK(origin IN ('manual','automatic')),
  deleted_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,key)
);
CREATE TABLE personal_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL, content text NOT NULL, sources jsonb NOT NULL DEFAULT '[]',
  generation_time timestamptz NOT NULL, task_id uuid NOT NULL, generated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,date)
);
CREATE TABLE journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL, content text NOT NULL, sources jsonb NOT NULL DEFAULT '[]',
  activity_end bigint NOT NULL, generated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,date)
);
INSERT INTO skills(slug,kind,name,description,instructions,output_format,example) VALUES
('plain-reading','explain','通俗解读','把新闻里的术语、背景和影响讲清楚。','用简洁的中文说明背景、关键概念与影响。每项新闻事实引用材料编号；区分报道事实与解释。','分段说明，关键术语附简短解释','示例：试用开放意味着可以体验产品，商业价格尚未公布，不能据此推断正式售价。'),
('source-comparison','comparison','多源对比','把同一事件的共识、差异与信息缺口放在一起看。','逐来源比较事实、测试条件和不同表述，区分共识与差异，不因数据不同就断言某方错误。','共识、差异、尚待确认三部分','示例：两份测试报告分别采用 1000 条与 500 条请求，硬件条件不同，响应时间不能直接比较。'),
('topic-brief','brief','专题简报','围绕选定材料整理变化、要点和跟进线索。','给出范围明确的简报，包含变化、关键事实、影响和需要继续关注的问题。事实引用材料编号。','标题、摘要、要点与跟进线索','示例：本周更新集中在开放试用与独立测试；商业定价仍缺少公开材料。'),
('mind-map','mindmap','思维导图','将新闻与专题整理为可以展开的层级结构。','将实际材料归纳为主题、事实与背景层级。节点保留来源标识，禁止生成没有依据的事实分支。','结构化层级导图','示例：产品发布包含试用安排、测试条件、未知信息三个分支，每个事实节点关联报道。'),
('bilingual-reading','bilingual','双语阅读','对照已有原文和中文，理解关键表达。','逐段对照实际取得的外文材料并解释重点表达。只有摘要时说明范围，不能扩写成完整原文。','原文、中文解读与重点词语','示例：Commercial pricing has not been announced. 商业价格尚未公布。pricing 指定价安排。');
