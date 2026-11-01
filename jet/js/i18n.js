// b26: languages. The picker (title screen) lists every language in its own script with a flag; the choice is remembered (localStorage "jet-lang").
// UI text is translated through a phrase table. Languages without a table yet fall back to English for the phrases they miss.
export const LANGS = [
  ["en", "English", "🇬🇧"], ["fr", "Français", "🇫🇷"], ["he", "עברית", "🇮🇱"], ["zh", "中文", "🇨🇳"], ["de", "Deutsch", "🇩🇪"], ["es", "Español", "🇪🇸"],
  ["ar", "العربية", "🇸🇦"], ["hi", "हिन्दी", "🇮🇳"], ["ja", "日本語", "🇯🇵"], ["ko", "한국어", "🇰🇷"],
  ["pt", "Português", "🇧🇷"], ["ru", "Русский", "🇷🇺"], ["it", "Italiano", "🇮🇹"], ["tr", "Türkçe", "🇹🇷"], ["id", "Bahasa Indonesia", "🇮🇩"], ["vi", "Tiếng Việt", "🇻🇳"],
  ["pl", "Polski", "🇵🇱"], ["nl", "Nederlands", "🇳🇱"], ["uk", "Українська", "🇺🇦"], ["th", "ไทย", "🇹🇭"], ["fa", "فارسی", "🇮🇷"], ["bn", "বাংলা", "🇧🇩"], ["ur", "اردو", "🇵🇰"],
  ["sv", "Svenska", "🇸🇪"], ["el", "Ελληνικά", "🇬🇷"], ["cs", "Čeština", "🇨🇿"], ["ro", "Română", "🇷🇴"], ["hu", "Magyar", "🇭🇺"], ["da", "Dansk", "🇩🇰"], ["fi", "Suomi", "🇫🇮"],
  ["no", "Norsk", "🇳🇴"], ["ms", "Bahasa Melayu", "🇲🇾"], ["fil", "Filipino", "🇵🇭"], ["sw", "Kiswahili", "🇰🇪"],
];
export const RTL = new Set(["he", "ar", "fa", "ur"]);
const ORDER = ["fr", "he", "zh", "de", "es", "ar", "hi", "ja", "ko", "pt", "ru", "it", "tr"];
// phrase -> translations in ORDER
const T = {
  "TAP TO FLY": ["TOUCHEZ POUR VOLER", "לחצו כדי לטוס", "点击起飞", "TIPPEN ZUM FLIEGEN", "TOCA PARA VOLAR", "المس للطيران", "उड़ने के लिए टैप करें", "タップして出撃", "터치해서 출격", "TOQUE PARA VOAR", "НАЖМИТЕ, ЧТОБЫ ЛЕТЕТЬ", "TOCCA PER VOLARE", "UÇMAK İÇİN DOKUN"],
  "by TESSIE": ["par TESSIE", "מאת TESSIE", "作者 TESSIE", "von TESSIE", "por TESSIE", "من TESSIE", "TESSIE द्वारा", "by TESSIE", "by TESSIE", "por TESSIE", "от TESSIE", "di TESSIE", "TESSIE'den"],
  "SCORE": ["SCORE", "ניקוד", "得分", "PUNKTE", "PUNTOS", "النقاط", "स्कोर", "スコア", "점수", "PONTOS", "ОЧКИ", "PUNTI", "PUAN"],
  "FUEL": ["CARBURANT", "דלק", "燃油", "TREIBSTOFF", "COMBUSTIBLE", "الوقود", "ईंधन", "燃料", "연료", "COMBUSTÍVEL", "ТОПЛИВО", "CARBURANTE", "YAKIT"],
  "EMPTY": ["VIDE", "ריק", "空", "LEER", "VACÍO", "فارغ", "खाली", "空", "빔", "VAZIO", "ПУСТО", "VUOTO", "BOŞ"],
  "FULL": ["PLEIN", "מלא", "满", "VOLL", "LLENO", "ممتلئ", "भरा", "満", "가득", "CHEIO", "ПОЛНЫЙ", "PIENO", "DOLU"],
  "LIFE": ["VIE", "חיים", "生命", "LEBEN", "VIDA", "الحياة", "जीवन", "ライフ", "생명", "VIDA", "ЖИЗНИ", "VITA", "CAN"],
  "GUN": ["CANON", "תותח", "机炮", "KANONE", "CAÑÓN", "مدفع", "तोप", "機関砲", "기관포", "CANHÃO", "ПУШКА", "CANNONE", "TOP"],
  "MISSILE": ["MISSILE", "טיל", "导弹", "RAKETE", "MISIL", "صاروخ", "मिसाइल", "ミサイル", "미사일", "MÍSSIL", "РАКЕТА", "MISSILE", "FÜZE"],
  "BOMB": ["BOMBE", "פצצה", "炸弹", "BOMBE", "BOMBA", "قنبلة", "बम", "爆弾", "폭탄", "BOMBA", "БОМБА", "BOMBA", "BOMBA"],
  "READY": ["PRÊT", "מוכן", "就绪", "BEREIT", "LISTO", "جاهز", "तैयार", "準備完了", "준비", "PRONTO", "ГОТОВО", "PRONTO", "HAZIR"],
  "TGT": ["CIBLE", "יעד", "目标", "ZIEL", "OBJ", "الهدف", "लक्ष्य", "目標", "표적", "ALVO", "ЦЕЛЬ", "BERS", "HEDEF"],
  "THR": ["GAZ", "מצערת", "油门", "SCHUB", "ACEL", "الدفع", "थ्रॉटल", "出力", "스로틀", "ACEL", "ТЯГА", "MOTORE", "GAZ"],
  "BRAKE": ["FREIN", "בלם", "刹车", "BREMSE", "FRENO", "فرامل", "ब्रेक", "ブレーキ", "브레이크", "FREIO", "ТОРМОЗ", "FRENO", "FREN"],
  "FLARES": ["LEURRES", "להבות", "诱饵弹", "FLARES", "BENGALAS", "المشاعل", "फ्लेयर", "フレア", "플레어", "FLARES", "ЛОВУШКИ", "FLARE", "FİŞEK"],
  "MISSION": ["MISSION", "משימה", "任务", "MISSION", "MISIÓN", "المهمة", "मिशन", "ミッション", "임무", "MISSÃO", "МИССИЯ", "MISSIONE", "GÖREV"],
  "PULL UP": ["REMONTEZ", "למשוך למעלה", "拉起", "HOCHZIEHEN", "SUBE", "ارتفع", "ऊपर खींचें", "引き起こせ", "상승", "SUBA", "ВВЕРХ", "TIRA SU", "YÜKSEL"],
  "TAKEOFF": ["DÉCOLLAGE", "המראה", "起飞", "START", "DESPEGUE", "إقلاع", "टेकऑफ़", "離陸", "이륙", "DECOLAR", "ВЗЛЁТ", "DECOLLO", "KALKIŞ"],
  "AUTO LAND": ["ATTERRISSAGE AUTO", "נחיתה אוטומטית", "自动降落", "AUTO-LANDUNG", "ATERRIZAJE AUTO", "هبوط آلي", "ऑटो लैंड", "自動着陸", "자동 착륙", "POUSO AUTO", "АВТОПОСАДКА", "ATTERRAGGIO AUTO", "OTO İNİŞ"],
  "AIRCRAFT READY": ["APPAREIL PRÊT", "המטוס מוכן", "战机就绪", "FLUGZEUG BEREIT", "AVIÓN LISTO", "الطائرة جاهزة", "विमान तैयार", "機体準備完了", "기체 준비 완료", "AERONAVE PRONTA", "САМОЛЁТ ГОТОВ", "VELIVOLO PRONTO", "UÇAK HAZIR"],
  "LOADING AMMO + FUEL": ["CHARGEMENT MUNITIONS + CARBURANT", "טוען תחמושת ודלק", "装填弹药与燃油", "MUNITION + TREIBSTOFF LADEN", "CARGANDO MUNICIÓN + COMBUSTIBLE", "تحميل الذخيرة والوقود", "गोला-बारूद और ईंधन लोड हो रहा है", "弾薬と燃料を搭載中", "탄약 및 연료 적재 중", "CARREGANDO MUNIÇÃO + COMBUSTÍVEL", "ЗАГРУЗКА БОЕЗАПАСА И ТОПЛИВА", "CARICO MUNIZIONI + CARBURANTE", "MÜHİMMAT + YAKIT YÜKLENİYOR"],
  "REFUELING + REARMING": ["RAVITAILLEMENT + RÉARMEMENT", "תדלוק והתחמשות", "加油并补充弹药", "TANKEN + NACHRÜSTEN", "REPOSTANDO + REARMANDO", "تزويد بالوقود والذخيرة", "ईंधन और हथियार भरे जा रहे हैं", "給油・再武装中", "급유 및 재무장 중", "REABASTECENDO + REARMANDO", "ЗАПРАВКА И ПЕРЕЗАРЯДКА", "RIFORNIMENTO + RIARMO", "YAKIT + MÜHİMMAT İKMALİ"],
  "ARMAMENT": ["ARMEMENT", "חימוש", "武器", "BEWAFFNUNG", "ARMAMENTO", "التسليح", "हथियार", "武装", "무장", "ARMAMENTO", "ВООРУЖЕНИЕ", "ARMAMENTO", "SİLAHLAR"],
  "COCKPIT": ["COCKPIT", "תא טייס", "座舱", "COCKPIT", "CABINA", "قمرة القيادة", "कॉकपिट", "コックピット", "조종석", "CABINE", "КАБИНА", "ABITACOLO", "KOKPİT"],
  "CHASE": ["POURSUITE", "מרדף", "追尾", "VERFOLGER", "PERSECUCIÓN", "مطاردة", "चेज़", "チェイス", "추적", "PERSEGUIÇÃO", "СЗАДИ", "INSEGUIMENTO", "TAKİP"],
  "Settings": ["Réglages", "הגדרות", "设置", "Einstellungen", "Ajustes", "الإعدادات", "सेटिंग्स", "設定", "설정", "Ajustes", "Настройки", "Impostazioni", "Ayarlar"],
  "Music": ["Musique", "מוזיקה", "音乐", "Musik", "Música", "الموسيقى", "संगीत", "音楽", "음악", "Música", "Музыка", "Musica", "Müzik"],
  "Effects": ["Effets", "אפקטים", "音效", "Effekte", "Efectos", "المؤثرات", "प्रभाव", "効果音", "효과음", "Efeitos", "Эффекты", "Effetti", "Efektler"],
  "Tilt": ["Inclinaison", "הטיה", "倾斜", "Neigung", "Inclinar", "إمالة", "झुकाव", "傾き", "기울기", "Inclinar", "Наклон", "Inclina", "Eğim"],
  "Invert": ["Inverser", "היפוך", "反转", "Invertieren", "Invertir", "عكس", "उलटा", "反転", "반전", "Inverter", "Инверсия", "Inverti", "Ters"],
  "Assist": ["Assistance", "סיוע", "辅助", "Hilfe", "Asistencia", "مساعدة", "सहायता", "アシスト", "도움", "Assistência", "Помощь", "Assistenza", "Yardım"],
  "Paused": ["Pause", "מושהה", "已暂停", "Pausiert", "Pausa", "متوقف مؤقتًا", "रुका हुआ", "一時停止", "일시정지", "Pausado", "Пауза", "In pausa", "Duraklatıldı"],
  "RESUME": ["REPRENDRE", "המשך", "继续", "WEITER", "SEGUIR", "استئناف", "जारी रखें", "再開", "계속", "CONTINUAR", "ПРОДОЛЖИТЬ", "RIPRENDI", "DEVAM"],
  "HOME": ["ACCUEIL", "בית", "主页", "START", "INICIO", "الرئيسية", "होम", "ホーム", "홈", "INÍCIO", "ДОМОЙ", "HOME", "ANA SAYFA"],
  "CONTINUE": ["CONTINUER", "המשך", "继续", "WEITER", "CONTINUAR", "متابعة", "जारी रखें", "続ける", "계속", "CONTINUAR", "ДАЛЕЕ", "CONTINUA", "DEVAM ET"],
  "NEXT": ["SUIVANT", "הבא", "下一关", "WEITER", "SIGUIENTE", "التالي", "अगला", "次へ", "다음", "PRÓXIMO", "ДАЛЕЕ", "AVANTI", "SONRAKİ"],
  "HIGH SCORES": ["MEILLEURS SCORES", "שיאים", "最高分", "BESTENLISTE", "MEJORES PUNTUACIONES", "أعلى النتائج", "हाई स्कोर", "ハイスコア", "최고 점수", "RECORDES", "РЕКОРДЫ", "RECORD", "REKORLAR"],
  "NEW": ["NOUVEAU", "חדש", "新游戏", "NEU", "NUEVO", "جديد", "नया", "新規", "새로", "NOVO", "НОВАЯ", "NUOVO", "YENİ"],
  "CONT": ["SUITE", "המשך", "继续", "WEITER", "SEGUIR", "متابعة", "जारी", "続き", "계속", "CONT", "ПРОД", "CONT", "DEVAM"],
  "LEVELS": ["NIVEAUX", "שלבים", "关卡", "LEVEL", "NIVELES", "المراحل", "स्तर", "ステージ", "레벨", "FASES", "УРОВНИ", "LIVELLI", "SEVİYELER"],
  "HOW TO FLY": ["COMMENT VOLER", "איך טסים", "飞行指南", "FLUGANLEITUNG", "CÓMO VOLAR", "كيف تطير", "कैसे उड़ें", "操作方法", "조종법", "COMO VOAR", "КАК ЛЕТАТЬ", "COME VOLARE", "NASIL UÇULUR"],
  "AIR": ["AIR", "אוויר", "空", "LUFT", "AIRE", "جو", "वायु", "空", "공중", "AR", "ВОЗД", "ARIA", "HAVA"],
  "GND": ["SOL", "קרקע", "地", "BODEN", "SUELO", "أرض", "ज़मीन", "地", "지상", "SOLO", "ЗЕМЛЯ", "TERRA", "KARA"],
  "SEA": ["MER", "ים", "海", "SEE", "MAR", "بحر", "समुद्र", "海", "해상", "MAR", "МОРЕ", "MARE", "DENİZ"],
  "kills": ["victoires", "הפלות", "击毁", "Abschüsse", "bajas", "إسقاط", "मार", "撃墜", "격추", "abates", "сбито", "abbattuti", "vuruş"],
  "flares": ["leurres", "להבות", "诱饵", "Flares", "bengalas", "مشاعل", "फ्लेयर", "フレア", "플레어", "flares", "ловушки", "flare", "fişek"],
  "EJECT!": ["ÉJECTION !", "הטסה החוצה!", "弹射！", "AUSSTIEG!", "¡EYECTAR!", "اقذف!", "इजेक्ट!", "脱出！", "탈출!", "EJETAR!", "КАТАПУЛЬТА!", "ESPELLI!", "FIRLAT!"],
  "EJECT! EJECT!": ["ÉJECTION ! ÉJECTION !", "היחלצות! היחלצות!", "弹射！弹射！", "AUSSTIEG! AUSSTIEG!", "¡EYECTAR! ¡EYECTAR!", "اقذف! اقذف!", "इजेक्ट! इजेक्ट!", "脱出！脱出！", "탈출! 탈출!", "EJETAR! EJETAR!", "КАТАПУЛЬТА! КАТАПУЛЬТА!", "ESPELLI! ESPELLI!", "FIRLAT! FIRLAT!"],
  "BACK IN THE AIR": ["DE RETOUR EN VOL", "חזרה לאוויר", "重返蓝天", "WIEDER IN DER LUFT", "DE VUELTA AL AIRE", "عدت إلى الجو", "फिर से आसमान में", "空へ復帰", "다시 비행 중", "DE VOLTA AO AR", "СНОВА В НЕБЕ", "DI NUOVO IN VOLO", "TEKRAR HAVADA"],
  "LANDING ASSIST": ["AIDE À L'ATTERRISSAGE", "סיוע נחיתה", "降落辅助", "LANDEHILFE", "AYUDA DE ATERRIZAJE", "مساعدة الهبوط", "लैंडिंग सहायता", "着陸アシスト", "착륙 보조", "AUXÍLIO DE POUSO", "ПОМОЩЬ ПРИ ПОСАДКЕ", "ASSISTENZA ATTERRAGGIO", "İNİŞ YARDIMI"],
  "TOUCHDOWN": ["POSÉ", "נגיעה", "着陆", "AUFSETZEN", "TOMA DE CONTACTO", "لمس الأرض", "टचडाउन", "接地", "착지", "TOQUE NA PISTA", "КАСАНИЕ", "TOCCO", "TEMAS"],
  "READY FOR TAKEOFF": ["PRÊT AU DÉCOLLAGE", "מוכן להמראה", "准备起飞", "STARTBEREIT", "LISTO PARA DESPEGAR", "جاهز للإقلاع", "टेकऑफ़ के लिए तैयार", "離陸準備完了", "이륙 준비 완료", "PRONTO PARA DECOLAR", "ГОТОВ К ВЗЛЁТУ", "PRONTO AL DECOLLO", "KALKIŞA HAZIR"],
  "REFUEL + REARM": ["RAVITAILLER + RÉARMER", "תדלוק + התחמשות", "加油 + 补弹", "TANKEN + NACHRÜSTEN", "REPOSTAR + REARMAR", "تزود بالوقود + تسليح", "ईंधन + हथियार", "給油 + 再武装", "급유 + 재무장", "REABASTECER + REARMAR", "ЗАПРАВКА + ПЕРЕЗАРЯДКА", "RIFORNIRE + RIARMARE", "İKMAL + SİLAHLANMA"],
  "LOW FUEL - AUTO LAND": ["CARBURANT BAS - ATTERRISSAGE AUTO", "דלק נמוך - נחיתה אוטומטית", "燃油不足 - 自动降落", "TREIBSTOFF NIEDRIG - AUTO-LANDUNG", "POCO COMBUSTIBLE - ATERRIZAJE AUTO", "وقود منخفض - هبوط آلي", "ईंधन कम - ऑटो लैंड", "燃料低下 - 自動着陸", "연료 부족 - 자동 착륙", "COMBUSTÍVEL BAIXO - POUSO AUTO", "МАЛО ТОПЛИВА - АВТОПОСАДКА", "CARBURANTE BASSO - ATTERRAGGIO AUTO", "YAKIT AZ - OTO İNİŞ"],
  "FUEL CRITICAL - AUTO LAND": ["CARBURANT CRITIQUE - ATTERRISSAGE AUTO", "דלק קריטי - נחיתה אוטומטית", "燃油告急 - 自动降落", "TREIBSTOFF KRITISCH - AUTO-LANDUNG", "COMBUSTIBLE CRÍTICO - ATERRIZAJE AUTO", "وقود حرج - هبوط آلي", "ईंधन गंभीर - ऑटो लैंड", "燃料危機 - 自動着陸", "연료 위급 - 자동 착륙", "COMBUSTÍVEL CRÍTICO - POUSO AUTO", "КРИТИЧЕСКИ МАЛО ТОПЛИВА - АВТОПОСАДКА", "CARBURANTE CRITICO - ATTERRAGGIO AUTO", "YAKIT KRİTİK - OTO İNİŞ"],
  "FUEL EMPTY - GLIDING": ["RÉSERVOIR VIDE - PLANÉ", "הדלק נגמר - גלישה", "燃油耗尽 - 滑翔", "TANK LEER - GLEITFLUG", "SIN COMBUSTIBLE - PLANEANDO", "نفد الوقود - انزلاق", "ईंधन खत्म - ग्लाइडिंग", "燃料切れ - 滑空中", "연료 없음 - 활공 중", "SEM COMBUSTÍVEL - PLANANDO", "ТОПЛИВО КОНЧИЛОСЬ - ПЛАНИРОВАНИЕ", "CARBURANTE ESAURITO - PLANATA", "YAKIT BİTTİ - SÜZÜLÜYOR"],
  "NO TARGETS IN RANGE": ["AUCUNE CIBLE À PORTÉE", "אין יעדים בטווח", "范围内无目标", "KEINE ZIELE IN REICHWEITE", "SIN OBJETIVOS EN RANGO", "لا أهداف في المدى", "सीमा में कोई लक्ष्य नहीं", "射程内に目標なし", "사거리 내 표적 없음", "SEM ALVOS NO ALCANCE", "НЕТ ЦЕЛЕЙ В ЗОНЕ", "NESSUN BERSAGLIO IN PORTATA", "MENZİLDE HEDEF YOK"],
  "+1 LIFE": ["+1 VIE", "+1 חיים", "+1 生命", "+1 LEBEN", "+1 VIDA", "+1 حياة", "+1 जीवन", "+1 ライフ", "+1 생명", "+1 VIDA", "+1 ЖИЗНЬ", "+1 VITA", "+1 CAN"],
  "Collision!": ["Collision !", "התנגשות!", "碰撞！", "Kollision!", "¡Colisión!", "اصطدام!", "टक्कर!", "衝突！", "충돌!", "Colisão!", "Столкновение!", "Collisione!", "Çarpışma!"],
  "PILOT SAFE  -  {n} LIVES LEFT": ["PILOTE SAUF  -  {n} VIES RESTANTES", "הטייס בטוח  -  נותרו {n} חיים", "飞行员安全  -  剩余 {n} 条命", "PILOT GERETTET  -  NOCH {n} LEBEN", "PILOTO A SALVO  -  QUEDAN {n} VIDAS", "الطيار بأمان  -  تبقى {n} أرواح", "पायलट सुरक्षित  -  {n} जीवन बाकी", "パイロット無事  -  残り{n}機", "조종사 무사  -  남은 목숨 {n}", "PILOTO A SALVO  -  RESTAM {n} VIDAS", "ПИЛОТ СПАСЁН  -  ОСТАЛОСЬ ЖИЗНЕЙ: {n}", "PILOTA SALVO  -  RIMANGONO {n} VITE", "PİLOT GÜVENDE  -  {n} CAN KALDI"],
  "PILOT SAFE  -  1 LIFE LEFT": ["PILOTE SAUF  -  1 VIE RESTANTE", "הטייס בטוח  -  נותר חיים אחד", "飞行员安全  -  剩余 1 条命", "PILOT GERETTET  -  NOCH 1 LEBEN", "PILOTO A SALVO  -  QUEDA 1 VIDA", "الطيار بأمان  -  تبقت حياة واحدة", "पायलट सुरक्षित  -  1 जीवन बाकी", "パイロット無事  -  残り1機", "조종사 무사  -  남은 목숨 1", "PILOTO A SALVO  -  RESTA 1 VIDA", "ПИЛОТ СПАСЁН  -  ОСТАЛАСЬ 1 ЖИЗНЬ", "PILOTA SALVO  -  RIMANE 1 VITA", "PİLOT GÜVENDE  -  1 CAN KALDI"],
  "PILOT SAFE  -  NO LIVES LEFT": ["PILOTE SAUF  -  PLUS DE VIES", "הטייס בטוח  -  אין עוד חיים", "飞行员安全  -  没有生命了", "PILOT GERETTET  -  KEINE LEBEN MEHR", "PILOTO A SALVO  -  SIN VIDAS", "الطيار بأمان  -  لا مزيد من الأرواح", "पायलट सुरक्षित  -  कोई जीवन नहीं बचा", "パイロット無事  -  残機なし", "조종사 무사  -  남은 목숨 없음", "PILOTO A SALVO  -  SEM VIDAS", "ПИЛОТ СПАСЁН  -  ЖИЗНЕЙ НЕТ", "PILOTA SALVO  -  NESSUNA VITA", "PİLOT GÜVENDE  -  CAN KALMADI"],
  "NEW SCENE": ["NOUVELLE SCÈNE", "סצנה חדשה", "新场景", "NEUE SZENE", "NUEVA ESCENA", "مشهد جديد", "नया दृश्य", "新しい場面", "새 장면", "NOVA CENA", "НОВАЯ СЦЕНА", "NUOVA SCENA", "YENİ SAHNE"],
  "LANGUAGE": ["LANGUE", "שפה", "语言", "SPRACHE", "IDIOMA", "اللغة", "भाषा", "言語", "언어", "IDIOMA", "ЯЗЫК", "LINGUA", "DİL"],
  "NEW SORTIE": ["NOUVELLE SORTIE", "גיחה חדשה", "新出击", "NEUER EINSATZ", "NUEVA SALIDA", "مهمة جديدة", "नया मिशन", "新規出撃", "새 출격", "NOVA SAÍDA", "НОВЫЙ ВЫЛЕТ", "NUOVA SORTITA", "YENİ GÖREV"],
  "RESUME SORTIE": ["REPRENDRE LA SORTIE", "המשך גיחה", "继续出击", "EINSATZ FORTSETZEN", "REANUDAR SALIDA", "استئناف المهمة", "मिशन जारी रखें", "出撃を再開", "출격 재개", "RETOMAR SAÍDA", "ПРОДОЛЖИТЬ ВЫЛЕТ", "RIPRENDI SORTITA", "GÖREVE DEVAM"],
  "GAME OVER": ["PARTIE TERMINÉE", "המשחק נגמר", "游戏结束", "SPIEL VORBEI", "FIN DEL JUEGO", "انتهت اللعبة", "गेम ओवर", "ゲームオーバー", "게임 오버", "FIM DE JOGO", "ИГРА ОКОНЧЕНА", "GAME OVER", "OYUN BİTTİ"],
  "TARGET": ["CIBLE", "מטרה", "目标", "ZIEL", "OBJETIVO", "هدف", "लक्ष्य", "目標", "표적", "ALVO", "ЦЕЛЬ", "BERSAGLIO", "HEDEF"],
};
let lang = "en";
const dict = {};
const tmpl = [], lc = {};
for (const k of Object.keys(T)) {
  T[k].forEach((v, i) => { (dict[ORDER[i]] ||= {})[k] = v; (lc[ORDER[i]] ||= {})[k.toLowerCase()] = v; });
  if (k.includes("{n}")) tmpl.push(k);
}
const listeners = [];
export function getLang() { return lang; }
export function langInfo(code = lang) { return LANGS.find((l) => l[0] === code) || LANGS[0]; }
export function hasTable(code) { return code === "en" || !!dict[code]; }
export function setLang(code, save = true) {
  if (!LANGS.some((l) => l[0] === code)) code = "en";
  lang = code;
  if (save) { try { localStorage.setItem("jet-lang", code); } catch { /* ignore */ } }
  document.documentElement.lang = code;
  document.body.classList.toggle("lang-rtl", RTL.has(code));
  applyDom();
  listeners.forEach((f) => { try { f(code); } catch { /* ignore */ } });
}
export function onLang(f) { listeners.push(f); }
export function initLang() {
  let c = "en";
  try { c = localStorage.getItem("jet-lang") || ""; } catch { /* ignore */ }
  if (!c) { c = "en"; }
  setLang(c, false);
}
/** translate a (possibly dynamic) phrase; unknown phrases pass through unchanged */
export function tr(s) {
  if (lang === "en" || typeof s !== "string") return s;
  const d = dict[lang]; if (!d) return s;
  if (d[s]) return d[s];
  const sn = s.replace(/\s+/g, " ");
  if (d[sn]) return d[sn];
  for (const k of tmpl) {
    const re = new RegExp("^" + k.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace("\\{n\\}", "(\\d+)").replace("{n}", "(\\d+)") + "$");
    const m = s.match(re);
    if (m && d[k]) return d[k].replace("{n}", m[1]);
  }
  const l = lc[lang][s.toLowerCase()] || lc[lang][sn.toLowerCase()]; if (l) return l;
  return s;
}
const SKIP = new Set(["SCRIPT", "STYLE", "CANVAS", "SVG"]);
function xl(n) {
  const p = n.parentNode; if (!p || SKIP.has(p.nodeName) || p.closest?.("#lang-list, #lang-btn, .no-i18n")) return;
  const raw = n.__en ?? n.nodeValue, key = raw.trim();
  if (!key) return;
  const tx = lang === "en" ? null : (dict[lang] && (dict[lang][key] || lc[lang][key.toLowerCase()]));
  if (tx) { if (n.__en === undefined) n.__en = raw; n.nodeValue = raw.replace(key, tx); }
  else if (n.__en !== undefined) { n.nodeValue = n.__en; delete n.__en; }
}
let mo = null;
export function watchDom() {
  if (mo || typeof MutationObserver === "undefined") return;
  mo = new MutationObserver((recs) => {
    if (lang === "en") return;
    for (const r of recs) for (const a of r.addedNodes) { if (a.nodeType === 3) xl(a); else if (a.nodeType === 1) applyDom(a); }
  });
  mo.observe(document.body, { childList: true, subtree: true });
}
export function applyDom(root = document.body) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    xl(n); continue;
    const p = n.parentNode; if (!p || SKIP.has(p.nodeName) || p.closest?.("#lang-list, #lang-btn, .no-i18n")) continue;
    const raw = n.__en ?? n.nodeValue, key = raw.trim();
    if (!key) continue;
    const tx = lang === "en" ? null : (dict[lang] && (dict[lang][key] || lc[lang][key.toLowerCase()]));
    if (tx) { if (n.__en === undefined) n.__en = raw; n.nodeValue = raw.replace(key, tx); }
    else if (n.__en !== undefined && lang === "en") { n.nodeValue = n.__en; delete n.__en; }
    else if (n.__en !== undefined) { n.nodeValue = n.__en; delete n.__en; }
  }
}
