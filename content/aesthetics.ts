import type { AestheticRecipe } from '../lib/generator';

export const AESTHETICS = [
  {
    slug: 'y2k',
    nameEn: 'Y2K',
    nameAr: 'واي تو كي',
    shortEn: 'Y2K',
    descriptionEn:
      'Glossy color and playful symbols bring an early digital mood to your screen. Butterflies, stars and open grids keep the matching icons lively.',
    descriptionAr:
      'ألوان لامعة ورموز مرحة تستحضر بدايات العالم الرقمي على شاشتك. تتناثر الفراشات والنجوم بين الشبكات المفتوحة لتكملها أيقونات نابضة بالحيوية.',
    palettes: ['midnight-y2k', 'bubblegum', 'lilac-dream', 'cotton-candy', 'emo-pink'],
    wallpapers: [
      {
        kind: 'pattern',
        weight: 3,
        params: {
          pattern: 'y2k-grid',
          scale: [1, 1.8],
          rotation: 0,
        },
      },
      {
        kind: 'scatter',
        weight: 3,
        params: {
          density: [0.35, 0.58],
          sizeMin: [0.04, 0.065],
          sizeMax: [0.09, 0.14],
          rotate: true,
          grain: [0.04, 0.09],
        },
      },
      {
        kind: 'mesh',
        weight: 2,
        params: {
          points: [4, 7],
          softness: [0.65, 0.95],
          grain: [0.04, 0.08],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['glass', 'gradient', 'outline'],
      weights: ['bold', 'fill'],
      scale: [0.52, 0.64],
      borderChance: 0.18,
      stickerChance: 0.2,
      shadowChance: 0.18,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.25, 0.4],
    },
    fonts: {
      display: ['space-grotesk', 'pacifico'],
      body: ['readex-pro'],
    },
    decor: ['butterfly', 'sparkle', 'star', 'heart'],
    moods: ['playful', 'bold'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'coquette',
    nameEn: 'Coquette',
    nameAr: 'كوكيت',
    shortEn: 'Ribbon',
    descriptionEn:
      'Soft ribbons and delicate checks give everyday icons a romantic setting. Blush tones and small floral details keep the composition light.',
    descriptionAr:
      'شرائط ناعمة ومربعات رقيقة تمنح أيقوناتك اليومية طابعًا رومانسيًا. تجمع الدرجات الوردية والتفاصيل الزهرية الصغيرة في تكوين خفيف ومتناغم.',
    palettes: ['coquette', 'strawberry-milk', 'rose-gold', 'sakura'],
    wallpapers: [
      {
        kind: 'pattern',
        weight: 3,
        params: {
          pattern: 'bows',
          scale: [2.1, 2.8],
          rotation: [-8, 8],
        },
      },
      {
        kind: 'pattern',
        weight: 2,
        params: {
          pattern: 'gingham',
          scale: [1, 1.8],
          rotation: [-8, 8],
        },
      },
      {
        kind: 'scatter',
        weight: 2,
        params: {
          density: [0.35, 0.58],
          sizeMin: [0.04, 0.065],
          sizeMax: [0.09, 0.14],
          rotate: true,
          grain: [0.04, 0.09],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid', 'outline'],
      weights: ['regular', 'light', 'duotone'],
      scale: [0.48, 0.6],
      borderChance: 0.18,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['paper', 'solid'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['fraunces', 'pacifico'],
      body: ['readex-pro'],
    },
    decor: ['heart', 'flower', 'sparkle'],
    moods: ['romantic', 'cute'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'kawaii',
    nameEn: 'Kawaii',
    nameAr: 'كاواي',
    shortEn: 'Kawaii',
    descriptionEn:
      'Round shapes and cheerful symbols turn your screen into a small collection of happy details. Bright pastel colors carry the same playful feeling into every icon.',
    descriptionAr:
      'أشكال مستديرة ورموز مبهجة تحوّل شاشتك إلى مجموعة صغيرة من التفاصيل اللطيفة. تمتد ألوان الباستيل الزاهية إلى الأيقونات ليبقى الإحساس المرح حاضرًا في كل زاوية.',
    palettes: ['bubblegum', 'cotton-candy', 'mint-sorbet', 'lemon-sorbet', 'baby-blue'],
    wallpapers: [
      {
        kind: 'pattern',
        weight: 3,
        params: {
          pattern: 'dots',
          scale: [0.8, 1.3],
          rotation: [-8, 8],
        },
      },
      {
        kind: 'scatter',
        weight: 3,
        params: {
          density: [0.35, 0.58],
          sizeMin: [0.04, 0.065],
          sizeMax: [0.09, 0.14],
          rotate: true,
          grain: [0.04, 0.09],
        },
      },
      {
        kind: 'sky',
        weight: 1,
        params: {
          mode: 'day',
          clouds: [0.25, 0.55],
          stars: 0,
          moon: false,
          grain: [0.04, 0.08],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid', 'gradient'],
      weights: ['fill', 'bold', 'duotone'],
      scale: [0.52, 0.64],
      borderChance: 0.18,
      stickerChance: 0.4,
      shadowChance: 0.18,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.25, 0.4],
    },
    fonts: {
      display: ['pacifico'],
      body: ['readex-pro'],
    },
    decor: ['star', 'heart', 'cloud', 'smiley'],
    moods: ['cute', 'playful'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'clean-minimal',
    nameEn: 'Clean Minimal',
    nameAr: 'بسيط ونظيف',
    shortEn: 'Minimal',
    descriptionEn:
      'Quiet gradients leave plenty of room around the details you use most. Fine icon strokes and restrained accents make the whole screen feel settled.',
    descriptionAr:
      'تترك التدرجات الهادئة مساحة واسعة حول التفاصيل التي تستخدمها كل يوم. تمنح خطوط الأيقونات الرفيعة واللمسات اللونية المحدودة الشاشة إحساسًا بالترتيب والراحة.',
    palettes: ['clean-girl', 'cloud-nine', 'vanilla-sky', 'noir'],
    wallpapers: [
      {
        kind: 'mesh',
        weight: 3,
        params: {
          points: [3, 4],
          softness: [0.65, 0.95],
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'aurora',
        weight: 1,
        params: {
          bands: [2, 4],
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'waves',
        weight: 1,
        params: {
          layers: [3, 5],
          amplitude: [0.25, 0.55],
          frequency: [0.3, 0.7],
          grain: [0.04, 0.09],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid', 'outline'],
      weights: ['thin', 'light'],
      scale: [0.45, 0.55],
      borderChance: 0.08,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['fraunces'],
      body: ['readex-pro'],
    },
    decor: ['sparkle'],
    moods: ['minimal', 'calm'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'dark-academia',
    nameEn: 'Dark Academia',
    nameAr: 'الأكاديمية المظلمة',
    shortEn: 'Study',
    descriptionEn:
      'Earthy shadows and bookish details echo a quiet evening in an old library. Fine symbols sit over warm textures with room for the clock to breathe.',
    descriptionAr:
      'ظلال ترابية وتفاصيل مستوحاة من الكتب تستحضر أمسية هادئة في مكتبة قديمة. تستقر الرموز الدقيقة فوق ملمس دافئ مع مساحة مريحة لظهور الساعة.',
    palettes: ['dark-academia', 'espresso', 'wine'],
    wallpapers: [
      {
        kind: 'mesh',
        weight: 2,
        params: {
          points: [3, 4],
          softness: [0.65, 0.95],
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'pattern',
        weight: 1,
        params: {
          pattern: 'stripes',
          scale: [1, 1.8],
          rotation: 0,
        },
      },
      {
        kind: 'scatter',
        weight: 2,
        params: {
          density: [0.28, 0.48],
          sizeMin: [0.025, 0.04],
          sizeMax: [0.055, 0.085],
          rotate: true,
          grain: [0.04, 0.09],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid', 'outline'],
      weights: ['light', 'regular'],
      scale: [0.45, 0.55],
      borderChance: 0.08,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['paper', 'solid'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['fraunces'],
      body: ['readex-pro'],
    },
    decor: ['book-open', 'feather', 'hourglass', 'moon'],
    moods: ['mysterious', 'elegant'],
    styles: [],
    season: 'autumn',
    variants: 10,
  },
  {
    slug: 'cottagecore',
    nameEn: 'Cottagecore',
    nameAr: 'حياة الريف',
    shortEn: 'Cottage',
    descriptionEn:
      'Garden greens and gentle checks bring the pace of a country morning to your phone. Leaves and flowers tie the wallpaper to a warm set of icons.',
    descriptionAr:
      'تمنح خضرة الحدائق والمربعات الهادئة هاتفك سكينة صباح ريفي. تربط الأوراق والزهور بين الخلفية ومجموعة أيقونات دافئة ومتناسقة.',
    palettes: ['sage-garden', 'matcha-latte', 'honey-oat', 'pistachio'],
    wallpapers: [
      {
        kind: 'pattern',
        weight: 3,
        params: {
          pattern: 'gingham',
          scale: [1, 1.8],
          rotation: [-8, 8],
        },
      },
      {
        kind: 'scatter',
        weight: 3,
        params: {
          density: [0.35, 0.58],
          sizeMin: [0.04, 0.065],
          sizeMax: [0.09, 0.14],
          rotate: true,
          grain: [0.04, 0.09],
        },
      },
      {
        kind: 'waves',
        weight: 1,
        params: {
          layers: [3, 5],
          amplitude: [0.25, 0.55],
          frequency: [0.3, 0.7],
          grain: [0.04, 0.09],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid', 'wallpaper'],
      weights: ['regular', 'duotone'],
      scale: [0.48, 0.6],
      borderChance: 0.18,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['paper', 'solid'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['fraunces'],
      body: ['readex-pro'],
    },
    decor: ['flower', 'leaf', 'plant'],
    moods: ['cozy', 'calm'],
    styles: [],
    season: 'spring',
    variants: 10,
  },
  {
    slug: 'cyberpunk',
    nameEn: 'Cyberpunk',
    nameAr: 'سايبربانك',
    shortEn: 'Circuit',
    descriptionEn:
      'Electric accents cut through deep color and futuristic grids. Circuit symbols and luminous icon edges give the screen a crisp night-time energy.',
    descriptionAr:
      'تشق اللمسات الكهربائية طريقها بين الألوان العميقة والشبكات المستقبلية. تضيف رموز الدوائر الإلكترونية وحواف الأيقونات المضيئة طاقة واضحة إلى أجواء الليل.',
    palettes: ['cyber-neon', 'vaporwave', 'galaxy'],
    wallpapers: [
      {
        kind: 'pattern',
        weight: 2,
        params: {
          pattern: 'y2k-grid',
          scale: [1, 1.8],
          rotation: 0,
        },
      },
      {
        kind: 'aurora',
        weight: 2,
        params: {
          bands: [2, 4],
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'mesh',
        weight: 1,
        params: {
          points: [4, 7],
          softness: [0.65, 0.95],
          grain: [0.04, 0.08],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['outline', 'glass'],
      weights: ['bold', 'regular'],
      scale: [0.48, 0.6],
      borderChance: 0.3,
      stickerChance: 0,
      shadowChance: 0.28,
    },
    widgets: {
      styles: ['glass', 'outline'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['jetbrains-mono', 'space-grotesk'],
      body: ['readex-pro'],
    },
    decor: ['lightning', 'cpu', 'circuitry'],
    moods: ['bold', 'edgy'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'vaporwave',
    nameEn: 'Vaporwave',
    nameAr: 'فيبرويف',
    shortEn: 'Afterglow',
    descriptionEn:
      'Sunset bands and distant grids drift between pink and cool blue. Rounded glass icons keep that retro digital atmosphere easy to live with.',
    descriptionAr:
      'تنساب أشرطة الغروب والشبكات البعيدة بين الوردي والأزرق البارد. تحافظ الأيقونات الزجاجية المستديرة على أجواء رقمية قديمة بتفاصيل مريحة للاستخدام اليومي.',
    palettes: ['vaporwave', 'lilac-dream', 'midnight-y2k'],
    wallpapers: [
      {
        kind: 'sky',
        weight: 2,
        params: {
          mode: 'sunset',
          clouds: [0.1, 0.35],
          stars: [0.02, 0.12],
          moon: false,
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'pattern',
        weight: 2,
        params: {
          pattern: 'y2k-grid',
          scale: [1, 1.8],
          rotation: 0,
        },
      },
      {
        kind: 'waves',
        weight: 1,
        params: {
          layers: [3, 5],
          amplitude: [0.25, 0.55],
          frequency: [0.3, 0.7],
          grain: [0.04, 0.09],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['gradient', 'glass'],
      weights: ['bold'],
      scale: [0.48, 0.6],
      borderChance: 0.3,
      stickerChance: 0,
      shadowChance: 0.28,
    },
    widgets: {
      styles: ['glass', 'outline'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['space-grotesk'],
      body: ['readex-pro'],
    },
    decor: ['sun-horizon', 'star', 'sparkle'],
    moods: ['retro', 'dreamy'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'pastel-dream',
    nameEn: 'Pastel Dream',
    nameAr: 'حلم الباستيل',
    shortEn: 'Reverie',
    descriptionEn:
      'Soft clouds and blended color make a gentle backdrop for your day. Small hearts and sparkles add detail without crowding the open areas.',
    descriptionAr:
      'تصنع السحب الناعمة والألوان الممتزجة خلفية هادئة ليومك. تضيف القلوب الصغيرة واللمعات تفاصيل لطيفة مع الحفاظ على المساحات المفتوحة.',
    palettes: ['cotton-candy', 'lavender-haze', 'baby-blue', 'mint-sorbet', 'peach-fuzz'],
    wallpapers: [
      {
        kind: 'mesh',
        weight: 3,
        params: {
          points: [4, 7],
          softness: [0.65, 0.95],
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'blobs',
        weight: 3,
        params: {
          count: [3, 6],
          blur: [0.25, 0.6],
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'sky',
        weight: 1,
        params: {
          mode: 'day',
          clouds: [0.25, 0.55],
          stars: 0,
          moon: false,
          grain: [0.04, 0.08],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['gradient', 'solid', 'glass'],
      weights: ['regular', 'fill'],
      scale: [0.48, 0.6],
      borderChance: 0.18,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['fraunces', 'pacifico'],
      body: ['readex-pro'],
    },
    decor: ['sparkle', 'cloud', 'heart'],
    moods: ['dreamy', 'cute'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'matcha-cafe',
    nameEn: 'Matcha Café',
    nameAr: 'مقهى الماتشا',
    shortEn: 'Café',
    descriptionEn:
      'Green tea tones and rounded forms recall a slow break at a favorite café. Leaf and coffee details carry that fresh warmth across the screen.',
    descriptionAr:
      'تستحضر درجات الشاي الأخضر والأشكال المستديرة استراحة هادئة في مقهاك المفضل. تنقل تفاصيل الأوراق والقهوة هذا الدفء المنعش إلى بقية الشاشة.',
    palettes: ['matcha-latte', 'pistachio', 'honey-oat'],
    wallpapers: [
      {
        kind: 'blobs',
        weight: 2,
        params: {
          count: [3, 6],
          blur: [0.25, 0.6],
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'waves',
        weight: 2,
        params: {
          layers: [3, 5],
          amplitude: [0.25, 0.55],
          frequency: [0.3, 0.7],
          grain: [0.04, 0.09],
        },
      },
      {
        kind: 'pattern',
        weight: 1,
        params: {
          pattern: 'dots',
          scale: [0.8, 1.3],
          rotation: [-8, 8],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid'],
      weights: ['regular', 'duotone'],
      scale: [0.48, 0.6],
      borderChance: 0.18,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['paper', 'solid'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['fraunces'],
      body: ['readex-pro'],
    },
    decor: ['coffee', 'leaf'],
    moods: ['cozy', 'fresh'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'latte-mocha',
    nameEn: 'Latte & Mocha',
    nameAr: 'لاتيه وموكا',
    shortEn: 'Café',
    descriptionEn:
      'Creamy gradients and warm waves borrow their colors from coffee and toasted oat. Simple cup details make the matching icons feel familiar and calm.',
    descriptionAr:
      'تستعير التدرجات الكريمية والموجات الدافئة ألوانها من القهوة والشوفان المحمّص. تمنح تفاصيل الفناجين البسيطة الأيقونات المتناسقة إحساسًا مألوفًا وهادئًا.',
    palettes: ['espresso', 'honey-oat', 'vanilla-sky', 'clean-girl'],
    wallpapers: [
      {
        kind: 'mesh',
        weight: 2,
        params: {
          points: [3, 4],
          softness: [0.65, 0.95],
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'waves',
        weight: 2,
        params: {
          layers: [3, 5],
          amplitude: [0.25, 0.55],
          frequency: [0.3, 0.7],
          grain: [0.04, 0.09],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid', 'outline'],
      weights: ['light', 'regular'],
      scale: [0.45, 0.55],
      borderChance: 0.08,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['paper', 'solid'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['fraunces'],
      body: ['readex-pro'],
    },
    decor: ['coffee', 'cookie'],
    moods: ['cozy', 'elegant'],
    styles: [],
    season: 'autumn',
    variants: 10,
  },
  {
    slug: 'sakura-spring',
    nameEn: 'Sakura Spring',
    nameAr: 'ربيع الساكورا',
    shortEn: 'Bloom',
    descriptionEn:
      'Petal colors and scattered blossoms suggest the first bright days of spring. Delicate floral icons keep the fresh mood close at hand.',
    descriptionAr:
      'توحي ألوان البتلات والزهور المتناثرة بأول أيام الربيع المشرقة. تحافظ الأيقونات الزهرية الرقيقة على هذا الإحساس المتجدد في متناول يدك.',
    palettes: ['sakura', 'cotton-candy', 'pistachio'],
    wallpapers: [
      {
        kind: 'scatter',
        weight: 3,
        params: {
          density: [0.35, 0.58],
          sizeMin: [0.04, 0.065],
          sizeMax: [0.09, 0.14],
          rotate: true,
          grain: [0.04, 0.09],
        },
      },
      {
        kind: 'blobs',
        weight: 2,
        params: {
          count: [3, 6],
          blur: [0.25, 0.6],
          grain: [0.04, 0.08],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid', 'gradient'],
      weights: ['regular', 'duotone'],
      scale: [0.48, 0.6],
      borderChance: 0.18,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['fraunces'],
      body: ['readex-pro'],
    },
    decor: ['flower', 'flower-lotus', 'butterfly'],
    moods: ['romantic', 'fresh'],
    styles: [],
    season: 'spring',
    variants: 10,
  },
  {
    slug: 'ocean-breeze',
    nameEn: 'Ocean Breeze',
    nameAr: 'نسيم المحيط',
    shortEn: 'Tides',
    descriptionEn:
      'Layered waves move through clear blues and seafoam greens. Small coastal symbols and calm icons make room for a slower rhythm.',
    descriptionAr:
      'تتحرك الموجات المتراكبة بين زرقة صافية وخضرة زبد البحر. تمنح الرموز الساحلية الصغيرة والأيقونات الهادئة الشاشة إيقاعًا أكثر سكينة.',
    palettes: ['ocean-breeze', 'seafoam', 'deep-ocean', 'baby-blue'],
    wallpapers: [
      {
        kind: 'waves',
        weight: 3,
        params: {
          layers: [3, 5],
          amplitude: [0.25, 0.55],
          frequency: [0.3, 0.7],
          grain: [0.04, 0.09],
        },
      },
      {
        kind: 'aurora',
        weight: 1,
        params: {
          bands: [2, 4],
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'blobs',
        weight: 1,
        params: {
          count: [3, 6],
          blur: [0.25, 0.6],
          grain: [0.04, 0.08],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid', 'glass'],
      weights: ['regular', 'bold'],
      scale: [0.48, 0.6],
      borderChance: 0.18,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['readex-pro'],
      body: ['readex-pro'],
    },
    decor: ['waves', 'fish', 'anchor'],
    moods: ['calm', 'fresh'],
    styles: [],
    season: 'summer',
    variants: 10,
  },
  {
    slug: 'sunset-glow',
    nameEn: 'Sunset Glow',
    nameAr: 'وهج الغروب',
    shortEn: 'Glow',
    descriptionEn:
      'Warm bands of peach and gold settle into a glowing horizon. Matching gradient icons hold a little of that evening light.',
    descriptionAr:
      'تستقر طبقات الخوخي والذهبي الدافئة عند أفق مضيء. تحتفظ الأيقونات المتدرجة المتناسقة بشيء من ضوء المساء.',
    palettes: ['apricot-sunset', 'peach-fuzz', 'vaporwave'],
    wallpapers: [
      {
        kind: 'sky',
        weight: 3,
        params: {
          mode: 'sunset',
          clouds: [0.1, 0.35],
          stars: [0.02, 0.12],
          moon: false,
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'mesh',
        weight: 2,
        params: {
          points: [4, 7],
          softness: [0.65, 0.95],
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'waves',
        weight: 1,
        params: {
          layers: [3, 5],
          amplitude: [0.25, 0.55],
          frequency: [0.3, 0.7],
          grain: [0.04, 0.09],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['gradient'],
      weights: ['bold', 'regular'],
      scale: [0.48, 0.6],
      borderChance: 0.18,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['fraunces'],
      body: ['readex-pro'],
    },
    decor: ['sun', 'sun-horizon'],
    moods: ['dreamy', 'calm'],
    styles: [],
    season: 'summer',
    variants: 10,
  },
  {
    slug: 'starry-night',
    nameEn: 'Starry Night',
    nameAr: 'ليلة النجوم',
    shortEn: 'Starlight',
    descriptionEn:
      'Tiny stars gather over deep gradients with a quieter space around the clock. Fine moon and sparkle details bring the night into the matching icons.',
    descriptionAr:
      'تتجمع النجوم الصغيرة فوق تدرجات عميقة وتترك مساحة أهدأ حول الساعة. تنقل تفاصيل القمر واللمعات الدقيقة سحر الليل إلى الأيقونات المتناسقة.',
    palettes: ['galaxy', 'midnight-y2k', 'deep-ocean', 'ramadan-night'],
    wallpapers: [
      {
        kind: 'sky',
        weight: 3,
        params: {
          mode: 'night',
          clouds: [0.04, 0.18],
          stars: [0.35, 0.7],
          moon: true,
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'scatter',
        weight: 2,
        params: {
          density: [0.28, 0.48],
          sizeMin: [0.025, 0.04],
          sizeMax: [0.055, 0.085],
          rotate: true,
          grain: [0.04, 0.09],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['glass', 'outline'],
      weights: ['light', 'regular'],
      scale: [0.48, 0.6],
      borderChance: 0.3,
      stickerChance: 0,
      shadowChance: 0.28,
    },
    widgets: {
      styles: ['glass', 'outline'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['fraunces'],
      body: ['readex-pro'],
    },
    decor: ['star', 'sparkle', 'moon'],
    moods: ['dreamy', 'mysterious'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'galaxy-dream',
    nameEn: 'Galaxy Dream',
    nameAr: 'حلم المجرّة',
    shortEn: 'Orbit',
    descriptionEn:
      'Violet clouds and flowing light suggest a small window into space. Planet details and glowing icons add a playful sense of discovery.',
    descriptionAr:
      'توحي السحب البنفسجية والأنوار المنسابة بنافذة صغيرة على الفضاء. تضيف تفاصيل الكواكب والأيقونات المضيئة إحساسًا مرحًا بالاكتشاف.',
    palettes: ['galaxy', 'vaporwave', 'aurora'],
    wallpapers: [
      {
        kind: 'aurora',
        weight: 2,
        params: {
          bands: [2, 4],
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'mesh',
        weight: 2,
        params: {
          points: [4, 7],
          softness: [0.65, 0.95],
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'sky',
        weight: 1,
        params: {
          mode: 'night',
          clouds: [0.04, 0.18],
          stars: [0.35, 0.7],
          moon: true,
          grain: [0.04, 0.08],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['glass', 'gradient'],
      weights: ['regular', 'bold'],
      scale: [0.48, 0.6],
      borderChance: 0.3,
      stickerChance: 0,
      shadowChance: 0.28,
    },
    widgets: {
      styles: ['glass', 'outline'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['space-grotesk'],
      body: ['readex-pro'],
    },
    decor: ['planet', 'rocket', 'star'],
    moods: ['dreamy', 'bold'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'retro-70s',
    nameEn: 'Retro 70s',
    nameAr: 'ريترو السبعينات',
    shortEn: 'Grooves',
    descriptionEn:
      'Curved bands and sunny colors bring a relaxed seventies rhythm to the screen. Bold flowers and rounded icons keep the look warm and playful.',
    descriptionAr:
      'تمنح الأشرطة المنحنية والألوان المشمسة الشاشة إيقاعًا هادئًا من السبعينات. تحافظ الزهور الواضحة والأيقونات المستديرة على طابع دافئ ومرح.',
    palettes: ['retro-groovy', 'citrus-pop', 'apricot-sunset', 'honey-oat'],
    wallpapers: [
      {
        kind: 'waves',
        weight: 3,
        params: {
          layers: [4, 6],
          amplitude: [0.55, 0.8],
          frequency: [0.3, 0.7],
          grain: [0.04, 0.09],
        },
      },
      {
        kind: 'pattern',
        weight: 1,
        params: {
          pattern: 'stripes',
          scale: [1, 1.8],
          rotation: 0,
        },
      },
      {
        kind: 'blobs',
        weight: 1,
        params: {
          count: [3, 6],
          blur: [0.25, 0.6],
          grain: [0.04, 0.08],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid'],
      weights: ['bold', 'fill'],
      scale: [0.52, 0.64],
      borderChance: 0.18,
      stickerChance: 0.2,
      shadowChance: 0.18,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.25, 0.4],
    },
    fonts: {
      display: ['fraunces'],
      body: ['readex-pro'],
    },
    decor: ['flower', 'sun', 'smiley'],
    moods: ['retro', 'playful'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'checkerboard',
    nameEn: 'Checkerboard',
    nameAr: 'مربعات',
    shortEn: 'Checks',
    descriptionEn:
      'Confident checks make an orderly canvas for bright accents. Bold icons and a few small symbols keep the pattern from feeling too formal.',
    descriptionAr:
      'تصنع المربعات الواضحة أرضية مرتبة للّمسات اللونية الزاهية. تمنح الأيقونات البارزة والرموز الصغيرة النقشة طابعًا مرحًا بعيدًا عن الرسمية.',
    palettes: ['checker-indie', 'bubblegum', 'mint-sorbet', 'lilac-dream'],
    wallpapers: [
      {
        kind: 'pattern',
        weight: 3,
        params: {
          pattern: 'checker',
          scale: [1, 1.8],
          rotation: 0,
        },
      },
      {
        kind: 'pattern',
        weight: 2,
        params: {
          pattern: 'gingham',
          scale: [1, 1.8],
          rotation: [-8, 8],
        },
      },
    ],
    lockWallpaper: 'same',
    icons: {
      fills: ['solid', 'outline'],
      weights: ['bold', 'regular'],
      scale: [0.52, 0.64],
      borderChance: 0.18,
      stickerChance: 0.2,
      shadowChance: 0.18,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.25, 0.4],
    },
    fonts: {
      display: ['space-grotesk'],
      body: ['readex-pro'],
    },
    decor: ['smiley', 'star'],
    moods: ['playful', 'retro'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'noir-mono',
    nameEn: 'Noir Mono',
    nameAr: 'أبيض وأسود',
    shortEn: 'Mono',
    descriptionEn:
      'Light and shadow do the work in this restrained monochrome composition. Fine icons and uncluttered shapes give every detail a clear place.',
    descriptionAr:
      'يتولى الضوء والظل رسم هذا التكوين الأحادي الهادئ. تمنح الأيقونات الدقيقة والأشكال البسيطة كل تفصيل مكانه الواضح.',
    palettes: ['noir', 'grunge', 'cloud-nine'],
    wallpapers: [
      {
        kind: 'mesh',
        weight: 2,
        params: {
          points: [3, 4],
          softness: [0.65, 0.95],
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'pattern',
        weight: 2,
        params: {
          pattern: 'grid',
          scale: [1, 1.8],
          rotation: 0,
        },
      },
      {
        kind: 'waves',
        weight: 1,
        params: {
          layers: [3, 5],
          amplitude: [0.25, 0.55],
          frequency: [0.3, 0.7],
          grain: [0.04, 0.09],
        },
      },
    ],
    lockWallpaper: 'same',
    icons: {
      fills: ['solid', 'outline'],
      weights: ['thin', 'regular'],
      scale: [0.45, 0.55],
      borderChance: 0.08,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['fraunces', 'space-grotesk'],
      body: ['readex-pro'],
    },
    decor: [],
    moods: ['minimal', 'elegant'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'grunge',
    nameEn: 'Grunge',
    nameAr: 'غرنج',
    shortEn: 'Static',
    descriptionEn:
      'Rough grain and dark tones create a worn-in backdrop with a sharp accent. Skulls and lightning details bring a little friction to the matching icons.',
    descriptionAr:
      'يصنع الملمس الخشن والألوان الداكنة خلفية معتّقة تبرز فيها لمسة لونية حادة. تضيف تفاصيل الجماجم والبرق شيئًا من التمرد إلى الأيقونات المتناسقة.',
    palettes: ['grunge', 'emo-pink', 'noir'],
    wallpapers: [
      {
        kind: 'mesh',
        weight: 2,
        params: {
          points: [4, 7],
          softness: [0.25, 0.5],
          grain: [0.1, 0.14],
        },
      },
      {
        kind: 'pattern',
        weight: 1,
        params: {
          pattern: 'grid',
          scale: [1, 1.8],
          rotation: 0,
        },
      },
      {
        kind: 'scatter',
        weight: 1,
        params: {
          density: [0.35, 0.58],
          sizeMin: [0.04, 0.065],
          sizeMax: [0.09, 0.14],
          rotate: true,
          grain: [0.1, 0.14],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['outline', 'solid'],
      weights: ['bold'],
      scale: [0.48, 0.6],
      borderChance: 0.18,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['solid', 'outline'],
      radius: [0.04, 0.14],
    },
    fonts: {
      display: ['space-grotesk'],
      body: ['readex-pro'],
    },
    decor: ['skull', 'lightning', 'star'],
    moods: ['edgy', 'dark'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'emo',
    nameEn: 'Emo',
    nameAr: 'إيمو',
    shortEn: 'Heartbreak',
    descriptionEn:
      'Deep pink and black frame broken hearts and bold symbols. Checks and scattered details give the screen an expressive late-night mood.',
    descriptionAr:
      'يحيط الوردي العميق والأسود بقلوب مكسورة ورموز واضحة. تمنح المربعات والتفاصيل المتناثرة الشاشة طابعًا معبّرًا يناسب سكون الليل.',
    palettes: ['emo-pink', 'midnight-y2k', 'noir'],
    wallpapers: [
      {
        kind: 'pattern',
        weight: 2,
        params: {
          pattern: 'checker',
          scale: [1, 1.8],
          rotation: 0,
        },
      },
      {
        kind: 'scatter',
        weight: 2,
        params: {
          density: [0.35, 0.58],
          sizeMin: [0.04, 0.065],
          sizeMax: [0.09, 0.14],
          rotate: true,
          grain: [0.1, 0.14],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid', 'outline'],
      weights: ['bold', 'fill'],
      scale: [0.48, 0.6],
      borderChance: 0.18,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['solid', 'outline'],
      radius: [0.04, 0.14],
    },
    fonts: {
      display: ['space-grotesk'],
      body: ['readex-pro'],
    },
    decor: ['heart-break', 'skull', 'star'],
    moods: ['edgy', 'dark'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'glassmorphism',
    nameEn: 'Glassmorphism',
    nameAr: 'زجاجي',
    shortEn: 'Glass',
    descriptionEn:
      'Soft color sits behind translucent panels and crisp symbols. Rounded glass icons repeat the same airy layers across the home screen.',
    descriptionAr:
      'تستقر الألوان الناعمة خلف ألواح شفافة ورموز واضحة. تكرر الأيقونات الزجاجية المستديرة هذه الطبقات الخفيفة على امتداد الشاشة الرئيسية.',
    palettes: ['lavender-haze', 'ocean-breeze', 'galaxy', 'aurora'],
    wallpapers: [
      {
        kind: 'blobs',
        weight: 3,
        params: {
          count: [3, 6],
          blur: [0.55, 0.8],
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'mesh',
        weight: 2,
        params: {
          points: [4, 7],
          softness: [0.65, 0.95],
          grain: [0.04, 0.08],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['glass'],
      weights: ['regular', 'light'],
      scale: [0.48, 0.6],
      borderChance: 0.3,
      stickerChance: 0,
      shadowChance: 0.28,
    },
    widgets: {
      styles: ['glass', 'outline'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['readex-pro'],
      body: ['readex-pro'],
    },
    decor: ['sparkle'],
    moods: ['minimal', 'dreamy'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'aurora-borealis',
    nameEn: 'Aurora Borealis',
    nameAr: 'الشفق القطبي',
    shortEn: 'Northern Lights',
    descriptionEn:
      'Flowing ribbons of light cross a quiet northern sky. Glass icons and distant mountain details leave the colors room to glow.',
    descriptionAr:
      'تعبر شرائط الضوء المنسابة سماء شمالية هادئة. تترك الأيقونات الزجاجية وتفاصيل الجبال البعيدة مساحة للألوان كي تتوهج.',
    palettes: ['aurora', 'deep-ocean', 'forest-night'],
    wallpapers: [
      {
        kind: 'aurora',
        weight: 4,
        params: {
          bands: [2, 4],
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'sky',
        weight: 1,
        params: {
          mode: 'night',
          clouds: [0.04, 0.18],
          stars: [0.35, 0.7],
          moon: true,
          grain: [0.04, 0.08],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['glass', 'outline'],
      weights: ['regular'],
      scale: [0.48, 0.6],
      borderChance: 0.3,
      stickerChance: 0,
      shadowChance: 0.28,
    },
    widgets: {
      styles: ['glass', 'outline'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['readex-pro'],
      body: ['readex-pro'],
    },
    decor: ['star', 'mountains'],
    moods: ['calm', 'mysterious'],
    styles: [],
    season: 'winter',
    variants: 10,
  },
  {
    slug: 'forest-moss',
    nameEn: 'Forest & Moss',
    nameAr: 'غابة وطحالب',
    shortEn: 'Woodland',
    descriptionEn:
      'Mossy greens and soft layers echo a sheltered woodland path. Leaves and tree details connect the wallpaper with a grounded icon set.',
    descriptionAr:
      'تستحضر الخضرة الطحلبية والطبقات الناعمة ممرًا هادئًا بين الأشجار. تربط تفاصيل الأوراق والأشجار الخلفية بمجموعة أيقونات متزنة وقريبة من الطبيعة.',
    palettes: ['forest-night', 'sage-garden', 'matcha-latte'],
    wallpapers: [
      {
        kind: 'waves',
        weight: 2,
        params: {
          layers: [3, 5],
          amplitude: [0.25, 0.55],
          frequency: [0.3, 0.7],
          grain: [0.04, 0.09],
        },
      },
      {
        kind: 'blobs',
        weight: 2,
        params: {
          count: [3, 6],
          blur: [0.25, 0.6],
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'scatter',
        weight: 1,
        params: {
          density: [0.35, 0.58],
          sizeMin: [0.04, 0.065],
          sizeMax: [0.09, 0.14],
          rotate: true,
          grain: [0.04, 0.09],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid', 'wallpaper'],
      weights: ['regular', 'duotone'],
      scale: [0.48, 0.6],
      borderChance: 0.18,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['fraunces'],
      body: ['readex-pro'],
    },
    decor: ['leaf', 'tree', 'mountains'],
    moods: ['calm', 'cozy'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'desert-sand',
    nameEn: 'Desert Sand',
    nameAr: 'رمال الصحراء',
    shortEn: 'Dunes',
    descriptionEn:
      'Warm sand tones flow into broad dunes and open gradients. Fine sun and cactus symbols keep the screen calm and spacious.',
    descriptionAr:
      'تنساب درجات الرمل الدافئة في كثبان واسعة وتدرجات مفتوحة. تحافظ رموز الشمس والصبّار الدقيقة على هدوء الشاشة واتساعها.',
    palettes: ['vanilla-sky', 'honey-oat', 'apricot-sunset', 'clean-girl'],
    wallpapers: [
      {
        kind: 'waves',
        weight: 3,
        params: {
          layers: [3, 5],
          amplitude: [0.25, 0.55],
          frequency: [0.3, 0.7],
          grain: [0.04, 0.09],
        },
      },
      {
        kind: 'mesh',
        weight: 2,
        params: {
          points: [3, 4],
          softness: [0.65, 0.95],
          grain: [0.04, 0.08],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid', 'outline'],
      weights: ['light', 'regular'],
      scale: [0.45, 0.55],
      borderChance: 0.08,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['paper', 'solid'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['fraunces', 'el-messiri'],
      body: ['readex-pro'],
    },
    decor: ['sun', 'cactus'],
    moods: ['calm', 'minimal'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'autumn-cozy',
    nameEn: 'Autumn Cozy',
    nameAr: 'خريف دافئ',
    shortEn: 'Autumn',
    descriptionEn:
      'Amber waves and scattered leaves bring the warmth of an autumn afternoon indoors. Coffee details and soft icons complete the settled mood.',
    descriptionAr:
      'تنقل الموجات الكهرمانية والأوراق المتناثرة دفء ظهيرة خريفية إلى شاشتك. تكمل تفاصيل القهوة والأيقونات الناعمة هذا الإحساس بالسكينة.',
    palettes: ['espresso', 'honey-oat', 'retro-groovy'],
    wallpapers: [
      {
        kind: 'waves',
        weight: 2,
        params: {
          layers: [3, 5],
          amplitude: [0.25, 0.55],
          frequency: [0.3, 0.7],
          grain: [0.04, 0.09],
        },
      },
      {
        kind: 'scatter',
        weight: 2,
        params: {
          density: [0.35, 0.58],
          sizeMin: [0.04, 0.065],
          sizeMax: [0.09, 0.14],
          rotate: true,
          grain: [0.04, 0.09],
        },
      },
      {
        kind: 'mesh',
        weight: 1,
        params: {
          points: [4, 7],
          softness: [0.65, 0.95],
          grain: [0.04, 0.08],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid'],
      weights: ['regular', 'duotone'],
      scale: [0.48, 0.6],
      borderChance: 0.18,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['paper', 'solid'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['fraunces'],
      body: ['readex-pro'],
    },
    decor: ['leaf', 'coffee', 'umbrella'],
    moods: ['cozy'],
    styles: [],
    season: 'autumn',
    variants: 10,
  },
  {
    slug: 'winter-frost',
    nameEn: 'Winter Frost',
    nameAr: 'صقيع الشتاء',
    shortEn: 'Frost',
    descriptionEn:
      'Pale skies and small snowflakes suggest a clear winter morning. Cool glass and simple icons keep the composition bright and quiet.',
    descriptionAr:
      'تستحضر السماء الفاتحة ورقاقات الثلج الصغيرة صباحًا شتويًا صافيًا. تحافظ اللمسات الزجاجية الباردة والأيقونات البسيطة على تكوين مضيء وهادئ.',
    palettes: ['cloud-nine', 'baby-blue', 'deep-ocean'],
    wallpapers: [
      {
        kind: 'sky',
        weight: 2,
        params: {
          mode: 'day',
          clouds: [0.25, 0.55],
          stars: 0,
          moon: false,
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'scatter',
        weight: 2,
        params: {
          density: [0.35, 0.58],
          sizeMin: [0.04, 0.065],
          sizeMax: [0.09, 0.14],
          rotate: true,
          grain: [0.04, 0.09],
        },
      },
      {
        kind: 'mesh',
        weight: 1,
        params: {
          points: [4, 7],
          softness: [0.65, 0.95],
          grain: [0.04, 0.08],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['glass', 'solid'],
      weights: ['light', 'regular'],
      scale: [0.48, 0.6],
      borderChance: 0.18,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['fraunces'],
      body: ['readex-pro'],
    },
    decor: ['snowflake', 'star'],
    moods: ['calm'],
    styles: [],
    season: 'winter',
    variants: 10,
  },
  {
    slug: 'holiday-cozy',
    nameEn: 'Holiday Cozy',
    nameAr: 'دفء الأعياد',
    shortEn: 'Festive',
    descriptionEn:
      'Warm red and evergreen tones gather around gifts and little stars. Rounded icons make the festive details feel welcoming through the whole season.',
    descriptionAr:
      'تجتمع درجات الأحمر الدافئ وخضرة الأشجار حول الهدايا والنجوم الصغيرة. تمنح الأيقونات المستديرة التفاصيل الاحتفالية طابعًا مرحبًا طوال الموسم.',
    palettes: ['holiday-cozy', 'wine', 'butter-cream'],
    wallpapers: [
      {
        kind: 'scatter',
        weight: 3,
        params: {
          density: [0.35, 0.58],
          sizeMin: [0.04, 0.065],
          sizeMax: [0.09, 0.14],
          rotate: true,
          grain: [0.04, 0.09],
        },
      },
      {
        kind: 'pattern',
        weight: 1,
        params: {
          pattern: 'stars',
          scale: [1.2, 2.2],
          rotation: [-8, 8],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid'],
      weights: ['fill', 'bold'],
      scale: [0.52, 0.64],
      borderChance: 0.18,
      stickerChance: 0.2,
      shadowChance: 0.18,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.25, 0.4],
    },
    fonts: {
      display: ['fraunces', 'pacifico'],
      body: ['readex-pro'],
    },
    decor: ['gift', 'star', 'snowflake', 'tree-evergreen'],
    moods: ['cozy', 'playful'],
    styles: [],
    season: 'christmas',
    variants: 10,
  },
  {
    slug: 'halloween',
    nameEn: 'Halloween',
    nameAr: 'هالوين',
    shortEn: 'After Dark',
    descriptionEn:
      'Pumpkin accents glow against deep shadows and a playful night sky. Friendly ghosts and bold symbols add a small shiver of fun.',
    descriptionAr:
      'تتوهج لمسات اليقطين أمام ظلال عميقة وسماء ليلية مرحة. تضيف الأشباح اللطيفة والرموز البارزة مسحة خفيفة من التشويق.',
    palettes: ['halloween', 'emo-pink', 'noir'],
    wallpapers: [
      {
        kind: 'scatter',
        weight: 3,
        params: {
          density: [0.35, 0.58],
          sizeMin: [0.04, 0.065],
          sizeMax: [0.09, 0.14],
          rotate: true,
          grain: [0.1, 0.14],
        },
      },
      {
        kind: 'sky',
        weight: 1,
        params: {
          mode: 'night',
          clouds: [0.04, 0.18],
          stars: [0.35, 0.7],
          moon: true,
          grain: [0.04, 0.08],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid', 'outline'],
      weights: ['bold', 'fill'],
      scale: [0.52, 0.64],
      borderChance: 0.18,
      stickerChance: 0.2,
      shadowChance: 0.18,
    },
    widgets: {
      styles: ['solid', 'outline'],
      radius: [0.04, 0.14],
    },
    fonts: {
      display: ['space-grotesk'],
      body: ['readex-pro'],
    },
    decor: ['ghost', 'skull', 'moon-stars', 'spiral'],
    moods: ['playful', 'dark'],
    styles: [],
    season: 'halloween',
    variants: 10,
  },
  {
    slug: 'ramadan-lanterns',
    nameEn: 'Ramadan Lanterns',
    nameAr: 'فوانيس رمضان',
    shortEn: 'Lanterns',
    descriptionEn:
      'Moonlit color and golden stars create a quiet setting for Ramadan evenings. Elegant symbols and generous spacing carry the warmth of shared nights.',
    descriptionAr:
      'تصنع ألوان ضوء القمر والنجوم الذهبية أجواء هادئة لأمسيات رمضان. تحمل الرموز الأنيقة والمساحات المريحة دفء الليالي التي نجتمع فيها.',
    palettes: ['ramadan-night', 'ramadan-cream', 'deep-ocean'],
    wallpapers: [
      {
        kind: 'sky',
        weight: 3,
        params: {
          mode: 'night',
          clouds: [0.04, 0.18],
          stars: [0.35, 0.7],
          moon: true,
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'pattern',
        weight: 2,
        params: {
          pattern: 'stars',
          scale: [1.2, 2.2],
          rotation: [-8, 8],
        },
      },
      {
        kind: 'scatter',
        weight: 2,
        params: {
          density: [0.28, 0.48],
          sizeMin: [0.025, 0.04],
          sizeMax: [0.055, 0.085],
          rotate: true,
          grain: [0.04, 0.09],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid', 'outline'],
      weights: ['regular', 'light'],
      scale: [0.48, 0.6],
      borderChance: 0.18,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['el-messiri', 'fraunces'],
      body: ['readex-pro'],
    },
    decor: ['moon-stars', 'star', 'sparkle'],
    moods: ['elegant', 'calm'],
    styles: [],
    season: 'ramadan',
    variants: 10,
  },
  {
    slug: 'eid-gold',
    nameEn: 'Eid Gold',
    nameAr: 'ذهب العيد',
    shortEn: 'Eid',
    descriptionEn:
      'Golden accents and small gifts bring a bright sense of celebration to the screen. Soft gradients and clear icons keep the festive look balanced.',
    descriptionAr:
      'تمنح اللمسات الذهبية والهدايا الصغيرة الشاشة بهجة احتفالية مشرقة. تحافظ التدرجات الناعمة والأيقونات الواضحة على توازن هذا الطابع المبهج.',
    palettes: ['ramadan-cream', 'ramadan-night', 'rose-gold', 'butter-cream'],
    wallpapers: [
      {
        kind: 'mesh',
        weight: 2,
        params: {
          points: [4, 7],
          softness: [0.65, 0.95],
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'scatter',
        weight: 2,
        params: {
          density: [0.28, 0.48],
          sizeMin: [0.025, 0.04],
          sizeMax: [0.055, 0.085],
          rotate: true,
          grain: [0.04, 0.09],
        },
      },
      {
        kind: 'pattern',
        weight: 1,
        params: {
          pattern: 'stars',
          scale: [1.2, 2.2],
          rotation: [-8, 8],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['gradient', 'solid'],
      weights: ['regular', 'fill'],
      scale: [0.48, 0.6],
      borderChance: 0.18,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['el-messiri', 'fraunces'],
      body: ['readex-pro'],
    },
    decor: ['sparkle', 'star', 'gift', 'moon-stars'],
    moods: ['elegant', 'playful'],
    styles: [],
    season: 'eid',
    variants: 10,
  },
  {
    slug: 'valentine',
    nameEn: 'Valentine',
    nameAr: 'عيد الحب',
    shortEn: 'Love Notes',
    descriptionEn:
      'Warm pinks and little hearts form a gentle note of affection. Rounded icons and scattered sparkles keep the romantic details light.',
    descriptionAr:
      'ترسم الدرجات الوردية الدافئة والقلوب الصغيرة رسالة مودة هادئة. تحافظ الأيقونات المستديرة واللمعات المتناثرة على خفة التفاصيل الرومانسية.',
    palettes: ['strawberry-milk', 'coquette', 'wine'],
    wallpapers: [
      {
        kind: 'pattern',
        weight: 3,
        params: {
          pattern: 'hearts',
          scale: [1.2, 2.2],
          rotation: [-8, 8],
        },
      },
      {
        kind: 'scatter',
        weight: 2,
        params: {
          density: [0.35, 0.58],
          sizeMin: [0.04, 0.065],
          sizeMax: [0.09, 0.14],
          rotate: true,
          grain: [0.04, 0.09],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid', 'gradient'],
      weights: ['fill', 'regular'],
      scale: [0.52, 0.64],
      borderChance: 0.18,
      stickerChance: 0.2,
      shadowChance: 0.18,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.25, 0.4],
    },
    fonts: {
      display: ['pacifico', 'fraunces'],
      body: ['readex-pro'],
    },
    decor: ['heart', 'heart-straight', 'sparkle'],
    moods: ['romantic'],
    styles: [],
    season: 'valentine',
    variants: 10,
  },
  {
    slug: 'summer-citrus',
    nameEn: 'Summer Citrus',
    nameAr: 'صيف الحمضيات',
    shortEn: 'Summer',
    descriptionEn:
      'Citrus colors and sunny symbols bring a fresh burst of summer to your phone. Bold icons keep their clarity against the lively background.',
    descriptionAr:
      'تمنح ألوان الحمضيات والرموز المشمسة هاتفك دفعة صيفية منعشة. تحافظ الأيقونات البارزة على وضوحها أمام الخلفية الحيوية.',
    palettes: ['citrus-pop', 'lemon-sorbet', 'apricot-sunset'],
    wallpapers: [
      {
        kind: 'scatter',
        weight: 2,
        params: {
          density: [0.35, 0.58],
          sizeMin: [0.04, 0.065],
          sizeMax: [0.09, 0.14],
          rotate: true,
          grain: [0.04, 0.09],
        },
      },
      {
        kind: 'blobs',
        weight: 2,
        params: {
          count: [3, 6],
          blur: [0.25, 0.6],
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'waves',
        weight: 1,
        params: {
          layers: [3, 5],
          amplitude: [0.25, 0.55],
          frequency: [0.3, 0.7],
          grain: [0.04, 0.09],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid'],
      weights: ['bold', 'fill'],
      scale: [0.52, 0.64],
      borderChance: 0.18,
      stickerChance: 0.2,
      shadowChance: 0.18,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.25, 0.4],
    },
    fonts: {
      display: ['space-grotesk'],
      body: ['readex-pro'],
    },
    decor: ['sun', 'orange-slice', 'waves'],
    moods: ['fresh', 'playful'],
    styles: [],
    season: 'summer',
    variants: 10,
  },
  {
    slug: 'spring-garden',
    nameEn: 'Spring Garden',
    nameAr: 'حديقة الربيع',
    shortEn: 'Garden',
    descriptionEn:
      'Fresh greens and scattered flowers suggest a garden waking after winter. Soft icon colors echo the blossoms without crowding them.',
    descriptionAr:
      'توحي الخضرة المتجددة والزهور المتناثرة بحديقة تستيقظ بعد الشتاء. تردد ألوان الأيقونات الناعمة ألوان الأزهار من دون أن تزاحمها.',
    palettes: ['pistachio', 'sakura', 'mint-sorbet'],
    wallpapers: [
      {
        kind: 'scatter',
        weight: 3,
        params: {
          density: [0.35, 0.58],
          sizeMin: [0.04, 0.065],
          sizeMax: [0.09, 0.14],
          rotate: true,
          grain: [0.04, 0.09],
        },
      },
      {
        kind: 'blobs',
        weight: 1,
        params: {
          count: [3, 6],
          blur: [0.25, 0.6],
          grain: [0.04, 0.08],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid', 'gradient'],
      weights: ['regular', 'duotone'],
      scale: [0.52, 0.64],
      borderChance: 0.18,
      stickerChance: 0.2,
      shadowChance: 0.18,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.25, 0.4],
    },
    fonts: {
      display: ['fraunces'],
      body: ['readex-pro'],
    },
    decor: ['flower', 'flower-tulip', 'butterfly', 'plant'],
    moods: ['fresh', 'cute'],
    styles: [],
    season: 'spring',
    variants: 10,
  },
  {
    slug: 'bauhaus-geo',
    nameEn: 'Bauhaus Geo',
    nameAr: 'هندسي باوهاوس',
    shortEn: 'Geometry',
    descriptionEn:
      'Circles, arches and confident blocks turn the screen into an ordered geometric study. Strong icon shapes share the same clear and playful structure.',
    descriptionAr:
      'تحوّل الدوائر والأقواس والكتل الواضحة الشاشة إلى تكوين هندسي مرتب. تشاركها أشكال الأيقونات القوية هذا البناء الواضح والمرح.',
    palettes: ['bauhaus', 'retro-groovy', 'checker-indie'],
    wallpapers: [
      {
        kind: 'shapes',
        weight: 4,
        params: {
          density: [0.65, 0.95],
          grain: [0.04, 0.07],
        },
      },
    ],
    lockWallpaper: 'same',
    icons: {
      fills: ['solid'],
      weights: ['bold', 'fill'],
      scale: [0.48, 0.6],
      borderChance: 0.18,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['solid', 'outline'],
      radius: [0.04, 0.14],
    },
    fonts: {
      display: ['space-grotesk'],
      body: ['readex-pro'],
    },
    decor: [],
    moods: ['bold', 'retro'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'leopard-luxe',
    nameEn: 'Leopard Luxe',
    nameAr: 'فهدي فاخر',
    shortEn: 'Spots',
    descriptionEn:
      'Warm neutrals and irregular spots give the screen a tactile, dressed-up feel. Small jewel details and clear icons balance the lively pattern.',
    descriptionAr:
      'تمنح الدرجات المحايدة الدافئة والبقع غير المنتظمة الشاشة طابعًا ملمسيًا أنيقًا. توازن تفاصيل الجواهر الصغيرة والأيقونات الواضحة حيوية النقشة.',
    palettes: ['leopard-luxe', 'rose-gold', 'noir'],
    wallpapers: [
      {
        kind: 'pattern',
        weight: 4,
        params: {
          pattern: 'leopard',
          scale: [1.5, 2.2],
          rotation: [-8, 8],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid', 'wallpaper'],
      weights: ['regular', 'fill'],
      scale: [0.48, 0.6],
      borderChance: 0.18,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['fraunces'],
      body: ['readex-pro'],
    },
    decor: ['crown', 'diamond', 'sparkle'],
    moods: ['elegant', 'bold'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'gamer-rgb',
    nameEn: 'Gamer RGB',
    nameAr: 'ألعاب RGB',
    shortEn: 'RGB',
    descriptionEn:
      'Electric ribbons and precise grids bring an after-dark gaming mood to your phone. Bright controller details and bold icons stay clear over the deep background.',
    descriptionAr:
      'تمنح شرائط الضوء الكهربائية والشبكات الدقيقة هاتفك أجواء جلسة لعب ليلية. تبقى تفاصيل وحدات التحكم المضيئة والأيقونات البارزة واضحة فوق الخلفية العميقة.',
    palettes: ['cyber-neon', 'galaxy', 'vaporwave'],
    wallpapers: [
      {
        kind: 'aurora',
        weight: 2,
        params: {
          bands: [2, 4],
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'pattern',
        weight: 2,
        params: {
          pattern: 'grid',
          scale: [1, 1.8],
          rotation: 0,
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['outline', 'glass'],
      weights: ['bold'],
      scale: [0.48, 0.6],
      borderChance: 0.3,
      stickerChance: 0,
      shadowChance: 0.28,
    },
    widgets: {
      styles: ['glass', 'outline'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['jetbrains-mono'],
      body: ['readex-pro'],
    },
    decor: ['game-controller', 'lightning', 'sword'],
    moods: ['bold', 'edgy'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'football-night',
    nameEn: 'Football Night',
    nameAr: 'ليلة كرة القدم',
    shortEn: 'Matchday',
    descriptionEn:
      'Dark field tones and crisp stripes capture the anticipation before an evening match. Generic ball and trophy symbols carry the energy without any club branding.',
    descriptionAr:
      'تلتقط ألوان الملعب الداكنة والخطوط الواضحة حماس انتظار مباراة مسائية. تنقل رموز الكرة والكأس العامة هذه الطاقة من دون شعارات أندية.',
    palettes: ['forest-night', 'deep-ocean', 'noir'],
    wallpapers: [
      {
        kind: 'pattern',
        weight: 2,
        params: {
          pattern: 'stripes',
          scale: [1, 1.8],
          rotation: 0,
        },
      },
      {
        kind: 'mesh',
        weight: 2,
        params: {
          points: [4, 7],
          softness: [0.65, 0.95],
          grain: [0.04, 0.08],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['solid'],
      weights: ['bold', 'fill'],
      scale: [0.48, 0.6],
      borderChance: 0.18,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['space-grotesk'],
      body: ['readex-pro'],
    },
    decor: ['soccer-ball', 'trophy', 'star'],
    moods: ['bold'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'dreamy-sky',
    nameEn: 'Dreamy Sky',
    nameAr: 'سماء حالمة',
    shortEn: 'Daydream',
    descriptionEn:
      'Soft clouds drift through an open sky of gentle color. Airy icons and small sun details leave space for an unhurried day.',
    descriptionAr:
      'تنساب السحب الناعمة في سماء مفتوحة من الألوان الهادئة. تترك الأيقونات الخفيفة وتفاصيل الشمس الصغيرة مساحة ليوم بلا استعجال.',
    palettes: ['baby-blue', 'cloud-nine', 'apricot-sunset'],
    wallpapers: [
      {
        kind: 'sky',
        weight: 4,
        params: {
          mode: 'day',
          clouds: [0.25, 0.55],
          stars: 0,
          moon: false,
          grain: [0.04, 0.08],
        },
      },
      {
        kind: 'mesh',
        weight: 1,
        params: {
          points: [4, 7],
          softness: [0.65, 0.95],
          grain: [0.04, 0.08],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['glass', 'solid'],
      weights: ['regular', 'light'],
      scale: [0.48, 0.6],
      borderChance: 0.18,
      stickerChance: 0,
      shadowChance: 0.08,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.16, 0.28],
    },
    fonts: {
      display: ['fraunces'],
      body: ['readex-pro'],
    },
    decor: ['cloud', 'sun', 'star'],
    moods: ['dreamy', 'calm'],
    styles: [],
    variants: 10,
  },
  {
    slug: 'butterfly-dreams',
    nameEn: 'Butterfly Dreams',
    nameAr: 'أحلام الفراشات',
    shortEn: 'Flutter',
    descriptionEn:
      'Little butterflies drift between lavender, pink and open pools of color. Rounded gradient and glass icons keep the dreamlike details together.',
    descriptionAr:
      'تحلّق فراشات صغيرة بين اللافندر والوردي ومساحات لونية مفتوحة. تجمع الأيقونات المستديرة المتدرجة والزجاجية هذه التفاصيل الحالمة في تكوين واحد.',
    palettes: ['lilac-dream', 'cotton-candy', 'midnight-y2k', 'sakura'],
    wallpapers: [
      {
        kind: 'scatter',
        weight: 3,
        params: {
          density: [0.35, 0.58],
          sizeMin: [0.04, 0.065],
          sizeMax: [0.09, 0.14],
          rotate: true,
          grain: [0.04, 0.09],
        },
      },
      {
        kind: 'mesh',
        weight: 2,
        params: {
          points: [4, 7],
          softness: [0.65, 0.95],
          grain: [0.04, 0.08],
        },
      },
    ],
    lockWallpaper: 'variant',
    icons: {
      fills: ['gradient', 'glass'],
      weights: ['regular', 'fill'],
      scale: [0.52, 0.64],
      borderChance: 0.18,
      stickerChance: 0.2,
      shadowChance: 0.18,
    },
    widgets: {
      styles: ['solid', 'glass'],
      radius: [0.25, 0.4],
    },
    fonts: {
      display: ['pacifico', 'fraunces'],
      body: ['readex-pro'],
    },
    decor: ['butterfly', 'sparkle', 'flower'],
    moods: ['dreamy', 'cute'],
    styles: [],
    variants: 10,
  },
] as const satisfies readonly AestheticRecipe[];

const recipeBySlug = new Map<string, AestheticRecipe>(
  AESTHETICS.map((recipe) => [recipe.slug, recipe]),
);
if (recipeBySlug.size !== AESTHETICS.length) throw new Error('Aesthetic slugs must be unique');

export function getRecipe(slug: string): AestheticRecipe | undefined {
  return recipeBySlug.get(slug);
}
