import { SidebarTrigger } from '@/components/ui/sidebar';
import { AuthButton } from '../auth/auth-button';
import { ThemeToggle } from '../theme-toggle';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/auth-context';
import { Compass } from 'lucide-react';
import { AppyPieLogo } from '../icons/logos';
import { useLocation, Link } from 'react-router';
import clsx from 'clsx';

export function GlobalHeader() {
	const { user } = useAuth();
	const { pathname } = useLocation();

	return (
		<motion.header
				initial={{ y: -10, opacity: 0 }}
				animate={{ y: 0, opacity: 1 }}
				transition={{ duration: 0.2, ease: 'easeOut' }}
				className={clsx("sticky top-0 z-50", pathname !== "/" && "bg-bg-3")}
			>
				<div className="relative">
					{/* Subtle gradient accent */}
					<div className="absolute inset-0 z-0" />

					{/* Main content */}
					<div className="relative z-10 grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-2">
						{/* Left section */}
						{user ? (
							<motion.div
								whileTap={{ scale: 0.95 }}
								transition={{
									type: 'spring',
									stiffness: 400,
									damping: 17,
								}}
								className='flex items-center'
							>
								<SidebarTrigger className="h-8 w-8 text-text-primary rounded-md hover:bg-orange-50/40 transition-colors duration-200" />
								<AppyPieLogo
									className="flex-shrink-0 transition-all duration-300"
									style={{
										width: '120px',
										height: '30px',
										marginLeft: '8px',
									}}
								/>
								<Link
									to="/discover"
									className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-text-primary hover:text-accent transition-colors duration-200 rounded-lg hover:bg-accent/10"
								>
									<Compass className="w-4 h-4" />
									<span className="hidden sm:inline">Discover</span>
								</Link>
							</motion.div>
						) : (
							<div></div>
						)}



						{/* Right section */}
						<motion.div
							initial={{ opacity: 0, x: 10 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ delay: 0.2 }}
							className="flex flex-wrap items-center justify-end gap-3 justify-self-end"
						>
														{/* Disable cost display for now */}
							{/* {user && (
							<CostDisplay
								{...extractUserAnalyticsProps(analytics)}
								loading={analyticsLoading}
								variant="inline"
							/>
						)} */}
							<ThemeToggle />
							<AuthButton />
						</motion.div>
					</div>
				</div>
			</motion.header>
	);
}
