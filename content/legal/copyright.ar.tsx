import type { ReactElement } from 'react';
import { Link } from '@/i18n/navigation';
import type { LegalBodyProps } from '@/lib/legal';

const FONT_CREDITS = [
  {
    name: 'Readex Pro',
    licence: 'https://raw.githubusercontent.com/google/fonts/main/ofl/readexpro/OFL.txt',
  },
  {
    name: 'Fraunces',
    licence: 'https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/OFL.txt',
  },
  {
    name: 'Pacifico',
    licence: 'https://raw.githubusercontent.com/google/fonts/main/ofl/pacifico/OFL.txt',
  },
  {
    name: 'Space Grotesk',
    licence: 'https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/OFL.txt',
  },
  {
    name: 'El Messiri',
    licence: 'https://raw.githubusercontent.com/google/fonts/main/ofl/elmessiri/OFL.txt',
  },
  {
    name: 'JetBrains Mono',
    licence: 'https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/OFL.txt',
  },
] as const;

export function CopyrightAr({
  operatorName,
  publicEmail,
  effectiveDate,
}: LegalBodyProps): ReactElement {
  const date = new Intl.DateTimeFormat('ar-u-nu-latn', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${effectiveDate}T00:00:00Z`));
  return (
    <>
      <p>
        تسري هذه المعلومات من <time dateTime={effectiveDate}>{date}</time>.
      </p>
      <section aria-labelledby="copyright-work">
        <h2 id="copyright-work">الأعمال الفنية واستخدامها</h2>
        <p>
          يجمع فايبست بين التصاميم المولّدة وأعمال المصممين ومكونات مفتوحة المصدر ذات تراخيص منفصلة.
          يحتفظ المصممون بما يملكونه من حقوق في مشاركاتهم. ولا تضمن المراجعة أو طريقة توليد التصميم
          غياب حقوق للآخرين فيه.
        </p>
        <p>
          حِزم التصاميم مجانية للاستخدام الشخصي وفق{' '}
          <Link href="/legal/terms" locale="ar">
            الشروط
          </Link>
          . لا تبعها ولا تعِد توزيعها كحِزم؛ شارك رابط صفحة التصميم بدلًا من ذلك. ولا تستبدل هذه
          القيود الحقوق المنفصلة التي تمنحها رخصة MIT ورخصة الخطوط SIL الموضحتان أدناه. أسماء
          التطبيقات تسميات وصفية؛ لا يقدم فايبست شعاراتها الرسمية ولا يدّعي أنها تؤيده.
        </p>
      </section>
      <section aria-labelledby="copyright-icons">
        <h2 id="copyright-icons">رموز Phosphor</h2>
        <p>
          مصدر الرموز العامة هو <a href="https://phosphoricons.com/">Phosphor Icons</a>، وحقوقها
          محفوظة لعام 2023 لـ Phosphor Icons بموجب{' '}
          <a href="https://github.com/phosphor-icons/core/blob/main/LICENSE">رخصة MIT</a>. تتيح
          الرخصة إعادة الاستخدام مع الالتزام بشروط إرفاق الإشعارات. نحتفظ بالنص الكامل للرخصة وإشعار
          الحقوق مع ملفات الرموز المضمّنة.
        </p>
      </section>
      <section aria-labelledby="copyright-fonts">
        <h2 id="copyright-fonts">الخطوط المستخدمة</h2>
        <p>
          يضم فايبست عائلات الخطوط الست الآتية بموجب{' '}
          <a href="https://openfontlicense.org/open-font-license-official-text/">
            رخصة الخطوط المفتوحة SIL، الإصدار 1.1
          </a>
          . يحتوي رابط كل عائلة على إشعار حقوقها ورخصتها.
        </p>
        <ul>
          {FONT_CREDITS.map((font) => (
            <li key={font.name}>
              <a href={font.licence}>
                <bdi dir="ltr">{font.name}</bdi>
              </a>
            </li>
          ))}
        </ul>
        <p>
          تحتفظ برمجيات الخطوط برخصتها وشروطها، ومنها شروط الأسماء المحجوزة إن وجدت. لا تعيد شروط
          الاستخدام الشخصي للحِزم ترخيص ملفات الخطوط. النص الإنجليزي الأصلي للرخصة هو النص المعتمد؛
          وهذه الصفحة شرح للمصادر وليست بديلًا عنه.
        </p>
      </section>
      <section aria-labelledby="copyright-report">
        <h2 id="copyright-report">الإبلاغ عن مسألة تتعلق بالحقوق</h2>
        <p>
          استخدم خيار الإبلاغ في التصميم، أو أرسل رسالة إلى{' '}
          <a href={`mailto:${publicEmail}`}>
            <bdi dir="ltr">{publicEmail}</bdi>
          </a>
          . يدير فايبست <bdi dir="ltr">{operatorName}</bdi>. لا يُنشر البلاغ كتعليق، ويمكنك التواصل
          دون حساب فايبست.
        </p>
        <p>أرفق ما يكفي لمساعدتنا على فهم المسألة:</p>
        <ul>
          <li>رابط صفحة فايبست، والصورة أو العنصر المعني إذا لزم.</li>
          <li>العمل أو الحق الذي تعتقد أنه متأثر، مع رابط أو مرجع مفيد.</li>
          <li>
            سبب اعتقادك أن الاستخدام غير مأذون به، وما إذا كنت صاحب الحق أو مخولًا بالتحدث باسمه.
          </li>
          <li>وسيلة للتواصل معك، والإجراء الذي تطلبه.</li>
        </ul>
        <p>
          هذه معلومات مساعدة وليست اشتراطًا لاستخدام نموذج قانوني معين. لا ترسل وثائق هوية غير لازمة
          أو صورًا خاصة أو روابط تسجيل دخول. قد نطلب توضيحًا ذا صلة ونقيّم المحتوى والأذونات والأدلة
          المتاحة. تقديم البلاغ لا يضمن إزالة المحتوى، وقد تضر الشكاوى المضللة عمدًا بالآخرين.
        </p>
        <p>
          نقيّم الأدلة ذات الصلة، وقد نطلب ما يلزم من توضيح عن العمل أو الاستخدام أو صلاحيتك لتقديم
          الطلب. يمكننا تقييد المحتوى أو إزالته بعد المراجعة. ويمكنك الرد بمعلومات ذات صلة إذا
          اعتقدت أن القرار غير صحيح. يعتمد الإجراء وتوقيته على الظروف والقانون المطبق؛ ولا نضمن
          إزالة تلقائية أو نتيجة محددة للرد.
        </p>
      </section>
      <section aria-labelledby="copyright-withdrawal">
        <h2 id="copyright-withdrawal">سحب عملك المنشور أو صورة تخصك</h2>
        <p>
          إذا أردت سحب عمل منشور، أو كانت صورة تتضمن معلومات شخصية تثير قلقك، فتواصل معنا بالوسيلة
          الموضحة أعلاه. حدد المحتوى المعني وما تطلبه. يمكنك تقديم طلب متعلق بالخصوصية على نحو منفصل
          عن شكوى حقوق النشر؛ راجع{' '}
          <Link href="/legal/privacy" locale="ar">
            إشعار الخصوصية
          </Link>
          .
        </p>
        <p>
          يزيل حذف الحساب التصاميم غير المنشورة، لكنه لا يزيل تلقائيًا التصاميم المنشورة أو الصور
          الأصلية التي لا تزال مستخدمة في تصاميم نحتفظ بها. نزيل ارتباطها بالحساب، ولذلك يتطلب سحب
          المحتوى المنشور طلبًا منفصلًا. لا تتيح إزالة المحتوى من الخدمة استرجاع كل نسخة نُزّلت
          خارجها؛ وهذا لا يلغي الالتزامات القانونية التي تنطبق على طلبك.
        </p>
      </section>
    </>
  );
}
