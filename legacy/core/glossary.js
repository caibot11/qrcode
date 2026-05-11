// Glossary of technical terms with plain-English explanations
// Each term has: short (1-sentence), long (extended with analogy), codeTypes (which codes use it)

export const GLOSSARY = {
  'finder pattern': {
    short: 'The three big squares in QR corners \u2014 they tell the scanner "a QR code is here" and which way it faces.',
    long: 'Finder patterns are like the corners of a picture frame. A scanner searches the image for three squares arranged in an L-shape, which instantly tells it where the QR code is and how it\'s rotated. Each finder is a 7\u00d77 module pattern with a specific black-white-black ratio (1:1:3:1:1) that\'s easy to detect at any angle.',
    codeTypes: ['qr']
  },
  'timing strip': {
    short: 'Alternating black-white line between finders \u2014 tells the scanner how wide each square is.',
    long: 'Think of timing strips like the ruler marks on a measuring tape. They run horizontally and vertically between finder patterns, alternating black-white-black. The scanner counts these to figure out exactly how many modules (tiny squares) fit in each row and column, even if the image is slightly stretched or skewed.',
    codeTypes: ['qr']
  },
  'alignment marker': {
    short: 'Small square that helps the scanner compensate when the code is viewed at an angle.',
    long: 'If you photograph a QR code from the side, it looks like a trapezoid instead of a square. Alignment markers are small 5\u00d75 bullseye patterns placed at known positions. The scanner uses them as reference points to "unwarp" the image back into a perfect grid. Version 1 QR codes are too small to need one; larger versions have more.',
    codeTypes: ['qr']
  },
  'module': {
    short: 'A single tiny square in the code \u2014 each one is either black (1) or white (0).',
    long: 'A module is the smallest unit of a 2D code, like a pixel in an image. In QR codes, Data Matrix, and Aztec codes, each module is a small square that\'s either dark (representing binary 1) or light (representing binary 0). The entire code\'s information is encoded in the pattern of these modules.',
    codeTypes: ['qr', 'datamatrix', 'aztec']
  },
  'mask pattern': {
    short: 'A checkerboard-like filter applied over the data squares. Without it, big blocks of the same color would confuse scanners.',
    long: 'Imagine your data happens to create a big block of all-black modules \u2014 a scanner might mistake that for a finder pattern! The mask is a mathematical pattern (like a checkerboard) that\'s XORed with the data area to break up such blocks. The QR spec defines 8 mask patterns, and the encoder picks whichever one produces the most balanced result.',
    codeTypes: ['qr']
  },
  'error correction': {
    short: 'Extra backup data added to the code. If part gets damaged, the backup can reconstruct what was lost.',
    long: 'Error correction is like sending a message twice through different channels. The code contains extra "redundant" bytes calculated from the original data using clever math. If some modules get scratched, covered by dirt, or printed poorly, the scanner can use these extra bytes to figure out what the damaged part should have been. QR codes can recover from up to 30% damage at the highest level.',
    codeTypes: ['qr', 'datamatrix', 'aztec', 'barcode']
  },
  'Reed-Solomon': {
    short: 'A math technique for creating backup data. Like writing your phone number twice \u2014 if one copy smudges, you still have the other.',
    long: 'Reed-Solomon is an error correction algorithm invented in 1960 by Irving Reed and Gustave Solomon. It treats data as points on a mathematical curve (polynomial). By adding extra points, you can reconstruct the original curve even if some points are wrong or missing. It\'s used in QR codes, CDs, DVDs, satellite communications, and even deep-space probes.',
    codeTypes: ['qr', 'datamatrix', 'aztec']
  },
  'codeword': {
    short: 'A group of 8 bits (modules) that together represent one piece of data.',
    long: 'Just like letters form words, individual bits (0s and 1s) are grouped into codewords. In most 2D codes, a codeword is 8 bits (1 byte). The data region of a code is divided into data codewords (your actual message) and error correction codewords (backup data). Each codeword can represent a number from 0 to 255.',
    codeTypes: ['qr', 'datamatrix', 'aztec']
  },
  'bitstream': {
    short: 'The raw sequence of 1s and 0s read from the code before it\'s converted into letters.',
    long: 'When the scanner reads modules in order, it builds up a long string of 1s and 0s called a bitstream. This raw binary data then needs to be parsed: first a mode indicator saying what kind of data follows, then a length, then the actual data bytes. It\'s like receiving a telegram in Morse code \u2014 you get dots and dashes first, then decode them into letters.',
    codeTypes: ['qr', 'datamatrix', 'aztec', 'barcode']
  },
  'format bits': {
    short: '15 special modules that tell the scanner which error correction level and mask were used.',
    long: 'Before the scanner can decode data, it needs to know two things: how much error correction was used, and which mask pattern was applied. These are encoded in 15 format bits placed near the finder patterns. The bits are protected with their own mini error correction code and XORed with a constant (0x5412) to ensure they\'re never all-zero.',
    codeTypes: ['qr']
  },
  'XOR': {
    short: 'A way to combine two values: if they match \u2192 0, if they differ \u2192 1. Used to apply and remove the mask.',
    long: 'XOR (exclusive or) is a fundamental operation in computing. Given two bits: 0 XOR 0 = 0, 1 XOR 1 = 0, 0 XOR 1 = 1, 1 XOR 0 = 1. The magic property: if you XOR something twice with the same value, you get back the original. This is why it\'s perfect for masks \u2014 the encoder XORs the data to apply the mask, and the decoder XORs again to remove it.',
    codeTypes: ['qr']
  },
  'EC level': {
    short: 'How much backup data is included: L (7%), M (15%), Q (25%), H (30%). Higher = more damage-resistant but less room for data.',
    long: 'QR codes offer four error correction levels. Level L recovers from ~7% damage and maximizes data capacity. Level M (~15%) is the default. Level Q (~25%) is good for industrial use. Level H (~30%) can survive heavy damage \u2014 this is what allows QR codes with logos in the center to still work. The trade-off: more protection means fewer modules available for actual data.',
    codeTypes: ['qr']
  },
  'zig-zag': {
    short: 'The reading path through a QR code \u2014 up one column pair, down the next, like a snake.',
    long: 'Data modules aren\'t read left-to-right like text. Instead, the scanner reads in a zig-zag pattern: starting from the bottom-right, it reads 2 columns at a time going upward, then shifts left and reads 2 columns going downward, and so on. This snake-like path ensures that adjacent data bits end up physically spread across the code, which improves error resilience.',
    codeTypes: ['qr']
  },
  'version': {
    short: 'The size of a QR code. Version 1 = 21\u00d721 squares, each version adds 4 rows and columns.',
    long: 'QR code "version" isn\'t about software updates \u2014 it\'s the physical size. Version 1 is the smallest at 21\u00d721 modules. Each version adds 4 modules per side: Version 2 = 25\u00d725, Version 3 = 29\u00d729, all the way to Version 40 = 177\u00d7177. Bigger versions can hold more data but need higher print resolution to remain scannable.',
    codeTypes: ['qr']
  },
  'quiet zone': {
    short: 'Empty space around a code that helps the scanner distinguish the code from its surroundings.',
    long: 'The quiet zone is like the margin on a printed page. It\'s a border of white (empty) space at least 4 modules wide around a QR code. Without it, the scanner might confuse nearby text or graphics as part of the code. Barcodes need quiet zones too \u2014 typically 10 times the width of the narrowest bar.',
    codeTypes: ['qr', 'barcode', 'datamatrix', 'aztec']
  },
  'guard bars': {
    short: 'Special bars at the start and end of a barcode that tell the scanner where the data begins and ends.',
    long: 'Guard bars are like bookends for a barcode. In Code 128, the start character tells the scanner which character set to use (A, B, or C), and the stop pattern signals the end of data. Without these markers, the scanner wouldn\'t know where the actual data bars begin or which direction to read them.',
    codeTypes: ['barcode']
  },
  'check digit': {
    short: 'A calculated number at the end that verifies nothing was misread.',
    long: 'A check digit is a simple form of error detection. It\'s calculated from all the other data using a formula (weighted sum modulo 103 for Code 128). The scanner performs the same calculation and compares. If the results don\'t match, something was misread. Unlike Reed-Solomon, a check digit can only detect errors \u2014 it can\'t correct them.',
    codeTypes: ['barcode']
  },
  'bullseye': {
    short: 'Concentric square rings at the center of an Aztec code \u2014 like a target/dartboard.',
    long: 'The bullseye is the Aztec code\'s finder pattern. Instead of QR\'s three-corner approach, Aztec puts one bullseye right in the center. It\'s made of alternating black and white square rings (2 rings for compact, 3 for full-range). This center placement is what makes Aztec codes more space-efficient \u2014 they don\'t need three large finders taking up corners.',
    codeTypes: ['aztec']
  },
  'clock track': {
    short: 'Alternating dots along the edge of a Data Matrix that establish the grid spacing.',
    long: 'The clock track runs along the top and right edges of a Data Matrix (opposite the L-shape finder). It\'s a row/column of alternating black and white modules, like a ruler. The scanner uses it to determine exactly how many rows and columns the symbol has, and to correct for any stretching or skewing of the image.',
    codeTypes: ['datamatrix']
  },
  'L-shape finder': {
    short: 'The solid border on two sides of a Data Matrix that helps the scanner find and orient it.',
    long: 'A Data Matrix has a solid black border along its bottom and left edges, forming an L-shape. This is the finder pattern \u2014 the scanner looks for this L to locate the symbol and determine its orientation. The opposite two edges have the alternating clock track pattern. Together, the L-finder and clock track frame the data region.',
    codeTypes: ['datamatrix']
  }
};

// Get all term keys sorted by length (longest first) for matching
export function getSortedTermKeys() {
  return Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
}

// Get terms filtered by code type
export function getTermsForCodeType(codeType) {
  const result = {};
  for (const [key, val] of Object.entries(GLOSSARY)) {
    if (val.codeTypes.includes(codeType)) {
      result[key] = val;
    }
  }
  return result;
}
