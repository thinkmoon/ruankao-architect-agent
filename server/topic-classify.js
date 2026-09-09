export const COMP_TOPICS = [
  { id: 'english', name: '英语阅读', keywords: [] },
  { id: 'math', name: '数学基础', keywords: ['排列组合', '排列', '组合', '概率', '体积', '会打篮球', '一种球都不会', '0到1000', '近似计算', '目标函数', '约束条件', '线性规划', '均匀分布', '随机变量', '最大利润', '最优方案', '既会', '小朋友', '指派'] },
  { id: 'ip', name: '知识产权', keywords: ['专利', '著作权', '商标', '版权', '知识产权', '外观设计', '发明专利', '商业秘密', '职务发明', '发明创造', '保密期', '国家机密', '国家标准', '标准化'] },
  { id: 'security', name: '信息安全', keywords: ['加密', '解密', '认证', '防火墙', 'SSL', 'TLS', 'PKI', '数字签名', '证书', '漏洞', 'SQL注入', 'XSS', '密钥', 'MD5', '安全审计', '数据安全', 'SYN Flood', '机密性', '访问控制', '安全治理', '信息泄露', '网络安全威胁', '安全保护等级', '数据分级', '等保', '灾难恢复', '故障切换'] },
  { id: 'ai', name: '人工智能', keywords: ['人工智能', '机器学习', '深度学习', '神经网络', '专家系统', '知识图谱', '大模型', 'LLM', '推荐系统', '基于内容的推荐', '文本聚类', '监督学习', '半监督', '自监督'] },
  { id: 'embedded', name: '嵌入式系统', keywords: ['嵌入式', '实时操作系统', 'RTOS', 'FPGA', 'DSP'] },
  { id: 'cloud', name: '云计算与分布式', keywords: ['微服务', '容器', 'Docker', 'Kubernetes', 'K8s', '云原生', 'Serverless', '负载均衡', '分布式锁', '分布式事务', '区块链', '挖矿', '虚拟化', '边缘计算', '网络切片'] },
  { id: 'bigdata', name: '大数据', keywords: ['大数据', '数据仓库', '数据湖', 'Hadoop', 'Spark', 'Lambda 架构', 'Lambda架构', '数据治理'] },
  { id: 'pm', name: '项目管理', keywords: ['WBS', '关键路径', 'PERT', '挣值', '里程碑', 'SPI', 'CPI', '配置管理', 'CMMI', '立项', '盈亏平衡', '产品配置', '乐观估计', '最可能', '赶工', '直接费用', '间接费用', '最短工期', '紧前作业', '所需天数', '所需的天数', '所需人数', '过程支持域', '过程域', '监理', '工作量', '衔接关系'] },
  { id: 'quality', name: '质量属性与架构评估', keywords: ['质量属性', '效用树', 'ATAM', 'CBAM', '可修改性', '可测试性', '易用性', 'N版本', '架构评估', 'ABSD', 'DSSA', '可用性', '可靠性', 'MTTF', 'MTBF', '平均失效', '平均故障', '失效率', '容错', '鲁棒', '健壮性', 'GB/T 16260', '软件质量', '性能设计', '系统性能', '可移植', '一对矛盾'] },
  { id: 'architecture', name: '软件架构设计', keywords: ['架构风格', '软件架构', '软件体系结构', '体系结构风格', 'MVC', 'MVP', 'MVVM', 'SOA', 'REST', '黑板', '管道-过滤器', '事件驱动', '4+1', 'Hofmeister', '4 视图', '4视图', '构件', '中间件', 'WSDL', 'Web服务', 'Web Service', 'WebService', 'UDDI', '架构复用', 'MDA', '模型驱动', 'C/S架构', 'C/S结构', 'B/S', '微内核架构', '批处理风格', '领域模型', '领域分析', '领域架构', '架构设计', 'EAI', '应用服务器', '遗留系统', '对象重用', 'COM支持'] },
  { id: 'se', name: '软件工程', keywords: ['软件过程', '螺旋模型', '瀑布模型', 'RUP', '敏捷', 'Scrum', '需求工程', '软件需求', '需求管理', '需求跟踪', '软件测试', '单元测试', '测试用例', '测试工具', '测试脚本', '测试度量', '白盒测试', '黑盒测试', '回归测试', '系统测试', '压力测试', 'AB测试', '条件覆盖', '判定覆盖', '语句覆盖', '软件维护', '完善性维护', '逆向工程', '净室', '面向对象', '设计模式', '创建型模式', 'UML', '用例图', '软件设计', '软件文档', '结构化设计', '结构化分析', 'McCabe', '环形复杂度', '开发工具', '软件复用', '可复用', '软件复杂性', '内聚', '耦合', '数据流图', '判定树', '判定表', '扇出', '扇入', '软件生命周期', '软件产品线', 'Hibernate', '调试', '继承', 'XML', '解释器', '重用', '复用', '安装、部署'] },
  { id: 'db', name: '数据库', keywords: ['数据库', 'SQL', 'SELECT', '范式', '事务', '索引', 'ACID', 'ER图', 'E-R图', '关系模式', '关系模型', '关系代数', '主键', '外键', '外码', '自然连接', '关系数据库', 'Redis', '缓存', '候选关键字', '候选码', '属性闭包', '函数依赖', '笛卡尔积', '给定关系', 'R∩S'] },
  { id: 'os', name: '操作系统', keywords: ['进程', '线程', '调度', '死锁', '文件系统', '虚拟内存', '页面置换', '信号量', '互斥', '位示图', '段式存储', '特权指令', '内存管理', '段页式', '系统监视', '写回磁盘', '多道程序', '绝对路径', '分时操作系统', 'I/O'] },
  { id: 'network', name: '计算机网络', keywords: ['路由器', '交换机', 'OSI', 'TCP', 'UDP', 'IP地址', 'IP网络', '子网', '以太网', 'VLAN', 'DNS', 'HTTP', 'HTTPS', '网络延迟', '调制解调', '半双工', '全双工', 'Internet', 'SDN', '路由表', '信道带宽', '物理层', '数据链路层', '5G网络', '传输速率', '奈奎斯特', '香农', '时钟同步', '编码方式'] },
  { id: 'informatization', name: '信息化与电子政务', keywords: ['电子政务', '信息化', '企业集成', 'ERP', 'CRM', '电子商务', 'BPR', '数字化转型', '数字孪生', '电子数据交换', 'EDI', '信息物理', 'CPS', '数据资产', '信息建模'] },
  { id: 'hardware', name: '计算机系统', keywords: ['冯·诺依曼', '指令集', 'CISC', 'RISC', '总线', '字长', '多核', '存储器层次', 'SoC', '片上系统', 'GPU', 'RAID', 'MIPS', 'PROM', '只读存储器', '采样', '芯片工作温度', 'I/O设备'] },
];

export const OTHER = { id: 'other', name: '其他' };

export function examTopicList() {
  return [...COMP_TOPICS, OTHER];
}

export function hasKeyword(hay, keyword) {
  if (!keyword) return false;
  if (/[A-Za-z]/.test(keyword) && keyword.length >= 3) return hay.toLowerCase().includes(keyword.toLowerCase());
  return hay.includes(keyword);
}

export function matchTopic(text, topics) {
  const hay = String(text || '');
  let best = null;
  let bestLen = 0;
  for (const topic of topics) {
    for (const keyword of topic.keywords || []) {
      if (!hasKeyword(hay, keyword) || keyword.length <= bestLen) continue;
      best = topic;
      bestLen = keyword.length;
    }
  }
  return best;
}

export function isEnglishStem(text) {
  const letters = (String(text || '').match(/[A-Za-z]/g) || []).length;
  return letters >= 48 && letters > String(text || '').length * 0.32;
}

export function classifyText(text) {
  return String(text || '')
    .replace(/>\s*来源说明：[\s\S]*/g, ' ')
    .replace(/\[[^\]]*]\(https?:\/\/[^)]+\)/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ');
}

export function classifyComprehensive(question) {
  const title = classifyText(question?.title);
  if (isEnglishStem(title)) return COMP_TOPICS[0];
  return matchTopic([title, ...(question?.options || []).map(classifyText)].join(' '), COMP_TOPICS) || OTHER;
}
