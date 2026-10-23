'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { HTMLMotionProps, Transition } from 'motion/react';
import { Children, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { springs } from '@/design/motion';

type MotionWrapperProps = Omit<
  HTMLMotionProps<'div'>,
  | 'children'
  | 'initial'
  | 'animate'
  | 'exit'
  | 'transition'
  | 'variants'
  | 'whileHover'
  | 'whileTap'
> & { children?: ReactNode };

const fadeTransition: Transition = {
  type: 'tween',
  duration: 0.22,
  ease: [0.2, 0, 0, 1],
};

const reducedTransition: Transition = { type: 'tween', duration: 0.08 };

// Timing springs preserve the preset's spring behavior within the interaction budget.
const pressTransition: Transition = {
  type: springs.pop.type,
  duration: 0.08,
  bounce: 0,
};

const popTransition: Transition = {
  type: springs.pop.type,
  duration: 0.32,
  bounce: 0.15,
};

export function FadeIn({ children, ...props }: MotionWrapperProps): ReactElement {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      {...props}
      initial={{ opacity: 0 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: [12, 0] }}
      transition={reducedMotion ? reducedTransition : fadeTransition}
    >
      {children}
    </motion.div>
  );
}

export function StaggerGrid({ children, ...props }: MotionWrapperProps): ReactElement {
  const reducedMotion = useReducedMotion();
  const [initialChildCount] = useState(() => Children.count(children));

  return (
    <motion.div {...props}>
      {Children.toArray(children).map((child, index) => (
        <motion.div
          key={typeof child === 'object' && 'key' in child ? child.key : index}
          initial={{ opacity: 0 }}
          animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: [12, 0] }}
          transition={
            reducedMotion
              ? reducedTransition
              : {
                  ...fadeTransition,
                  delay: index < Math.min(12, initialChildCount) ? index * 0.03 : 0,
                }
          }
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

export function PressScale({ children, ...props }: MotionWrapperProps): ReactElement {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      {...props}
      whileTap={reducedMotion ? undefined : { scale: 0.98 }}
      tabIndex={-1}
      transition={reducedMotion ? reducedTransition : pressTransition}
    >
      {children}
    </motion.div>
  );
}

export function PopIn({ children, ...props }: MotionWrapperProps): ReactElement {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      {...props}
      initial={{ opacity: 0 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: [0.96, 1] }}
      transition={reducedMotion ? reducedTransition : popTransition}
    >
      {children}
    </motion.div>
  );
}
