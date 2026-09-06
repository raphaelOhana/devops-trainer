import { readFileSync, writeFileSync } from 'node:fs';

const entries = JSON.parse(readFileSync('entries.json', 'utf8'));

// --- Nature de la ressource ----------------------------------------------
// On sépare le pérenne (cours, tutos, livres, références) du périssable
// (writeup d'une CVE précise) : seul le premier nourrit un catalogue.
const RX_COURSE = /\b(course|courses|tutorial|tutorials|guide|guides|introduction|intro|learning|learn|book|handbook|class|wiki|cheat ?sheet|primer|fundamentals|basics|beginner|explained|understanding|101|reference|documentation|docs|notebook|training|awesome|roadmap|demystified|deep dive|series|crash course|from scratch|hands-on|how ?to|walkthrough|internals|for everyone|self-guided)\b/i;
const RX_WRITEUP = /\b(CVE-\d|pwn2own|writeup|write-up|ctf|quals|exploiting|exploitation of|bypassing|attacking|abusing|hacking the|0-?click|n-?day|0-?day|part \d|analysis of|dumping|rooting|jailbreak|escape|chain)\b/i;
const RX_TOOL = /\b(tool|toolkit|framework|fuzzer|emulator|plugin|engine|scanner|sniffer|library|repository|repo|cross reference|checker)\b/i;

function kind(e) {
  const t = `${e.title} ${e.desc}`;
  if (RX_COURSE.test(t)) return 'cours';
  if (RX_TOOL.test(t)) return 'outil';
  if (RX_WRITEUP.test(t)) return 'writeup';
  return 'ressource';
}

// --- Rattachement à un topic de l'app ------------------------------------
// Ordre = priorité : la 1re règle qui matche gagne.
const MAP = [
  ['memory-safety',  /\b(heap|malloc|free|tcache|fastbin|glibc|jemalloc|scudo|allocator|use-after-free|UAF|double.?free|overflow|out-of-bounds|OOB|safe-linking|house of|stack smashing|memory corruption|sanitizer|ASAN)\b/i],
  ['linux-kernel',   /\b(kernel|kmalloc|slab|slub|syscall|kprobe|rootkit|LKM|eBPF|kASLR|io_uring|netfilter|procfs|module|ring0|privilege escalation|privesc)\b/i],
  ['exploit-dev',    /\b(ROP|JOP|SROP|gadget|shellcode|mitigation|RELRO|canary|NX|DEP|CFI|CET|ASLR|PIE|pwn|exploit|primitive|arbitrary (read|write)|libc|GOT|PLT|format string|sigreturn|fuzzing|fuzz|AFL|libFuzzer|syzkaller)\b/i],
  ['reversing',      /\b(reverse engineer|reversing|ghidra|IDA|radare|binary ninja|binja|disassembl|decompil|debugger|debugging|gdb|windbg|x64dbg|x86dbg|anti-debug|packer|packing|obfuscat|unpack|binary (parsing|diffing)|patch ?diff|assembly|x86|ARM64|AArch64|ARMv8|RISC-V|MIPS|calling convention|ELF|PE format|malware analysis)\b/i],
  ['hardware',       /\b(firmware|UEFI|BIOS|bootloader|secure boot|TrustZone|TEE|TPM|secure element|JTAG|SWD|UART|SPI|I2C|glitch|fault injection|side.?channel|laser|voltage|chip|SoC|microcontroller|ESP32|STM32|nRF|BL602|raspberry|FPGA|hardware|PCB|soldering|flash dump|EEPROM)\b/i],
  ['networking',     /\b(802\.11|wi-?fi|wpa2?3?|WEP|bluetooth|BLE|zigbee|z-wave|LoRa|NFC|RFID|SDR|GSM|LTE|5G|3GPP|baseband|radio|antenna|packet|TCP|DNS|BGP|proxy|tunnel|C2|beacon|DTLS|QUIC)\b/i],
  // « cryp[rt] » : le dépôt source écrit « Cryprography » (typo à l'identique).
  ['cryptography',   /\b(cryp[rt]|encryption|cipher|AES|RSA|ECC|ECDSA|curve|TLS|SSL|hash|SHA|HMAC|signature|key ?exchange|handshake|entropy|random|cryptopals|PKI|certificate)\b/i],
  ['iot-edge',       /\b(ICS|SCADA|OT security|modbus|PLC|industrial|IoT|smart (home|lock|bulb|camera)|router|camera|drone|automotive|CAN bus|satellite|robot|vehicle)\b/i],
  ['appsec',         /\b(web|XSS|SSRF|CSRF|SQLi|injection|RCE|deserializ|supply chain|OAuth|JWT|session|browser|chrome|V8|JavaScriptCore|WebKit|node\.?js|django|rails|php)\b/i],
  ['ai-llm',         /\b(LLM|GPT|Claude|AI\b|machine learning|prompt|agent|MCP|LangSmith|LangChain)\b/i],
  ['languages',      /\b(rust|C\+\+|golang|compiler|LLVM|clang|atomics|concurrency)\b/i],
  ['testing',        /\b(testing|test suite|QA|trail of bits testing)\b/i],
];

// Repêchage par section quand le titre seul ne dit rien (« Documentation »,
// « Part 2 »…) : la section d'origine porte alors toute l'information.
const SECTION_MAP = [
  [/^Libcs$/i,                    'memory-safety'],
  [/^Heap$/i,                     'memory-safety'],
  [/^Practice$/i,                 'exploit-dev'],
  [/^Mitigations$/i,              'exploit-dev'],
  [/^(TEE|Embedded and RTOS)$/i,  'hardware'],
  [/^(Rootkits|Fuzzing|Toolchains and Cross-compilation)$/i, 'linux-kernel'],
  [/^(802\.11|Bluetooth|SDR and SDP|3GPP|Z-Wave|Networking)$/i, 'networking'],
  [/^(Microcontrollers Vendors)$/i, 'hardware'],
  [/^(IoT)$/i,                    'iot-edge'],
  [/^(C2 Frameworks|Malwares|Backdoors)$/i, 'reversing'],
  [/^Rust$/i,                     'languages'],
];

function topic(e) {
  const t = `${e.title} ${e.desc} ${e.h2} ${e.h3}`;
  for (const [name, rx] of MAP) if (rx.test(t)) return name;
  for (const [rx, name] of SECTION_MAP) if (rx.test(e.h3) || rx.test(e.h2)) return name;
  if (e.source === 'linux_kernel') return 'linux-kernel';
  if (e.source === 'exploitation') return 'exploit-dev';
  if (e.source === 'wireless') return 'networking';
  return 'non-classé';
}

for (const e of entries) { e.kind = kind(e); e.topic = topic(e); }

writeFileSync('classified.json', JSON.stringify(entries, null, 1));

// --- Rapport -------------------------------------------------------------
const grid = {};
for (const e of entries) {
  grid[e.topic] ??= { cours: 0, ressource: 0, outil: 0, writeup: 0, total: 0 };
  grid[e.topic][e.kind]++; grid[e.topic].total++;
}
console.log('topic'.padEnd(16), 'cours ress. outil write. TOTAL');
for (const [k, v] of Object.entries(grid).sort((a, b) => b[1].total - a[1].total)) {
  console.log(k.padEnd(16),
    String(v.cours).padStart(5), String(v.ressource).padStart(5),
    String(v.outil).padStart(5), String(v.writeup).padStart(6), String(v.total).padStart(6));
}
console.log('\nTOTAL', entries.length);
console.log('\n--- non classés (échantillon) ---');
entries.filter((e) => e.topic === 'non-classé').slice(0, 25)
  .forEach((e) => console.log(' •', e.title.slice(0, 90)));
