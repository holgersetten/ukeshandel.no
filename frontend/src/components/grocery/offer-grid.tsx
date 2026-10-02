'use client';

import { OfferCard, type Offer } from "./offer-card"
import { OfferCardSkeleton } from "./offer-skeleton"
import { cn } from "@/lib/utils"
import { ShoppingBag } from "lucide-react"

interface OfferGridProps {
  offers: Offer[]
  onOfferClick?: (offer: Offer) => void
  isLoading?: boolean
  skeletonCount?: number
  className?: string
}

export function OfferGrid({
  offers,
  onOfferClick,
  isLoading = false,
  skeletonCount = 8,
  className,
}: OfferGridProps) {
  if (isLoading) {
    return (
      <div
        className={cn(
          "grid grid-cols-2 gap-2 sm:gap-4 sm:grid-cols-3 md:grid-cols-4",
          className
        )}
      >
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <OfferCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (offers.length === 0) {
    return <OfferEmptyState />
  }

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 sm:gap-4 sm:grid-cols-3 md:grid-cols-4",
        className
      )}
    >
      {offers.map((offer) => (
        <OfferCard key={offer.id} offer={offer} onClick={onOfferClick} />
      ))}
    </div>
  )
}

interface OfferListProps {
  offers: Offer[]
  onOfferClick?: (offer: Offer) => void
  isLoading?: boolean
  skeletonCount?: number
  className?: string
}

export function OfferList({
  offers,
  onOfferClick,
  isLoading = false,
  skeletonCount = 6,
  className,
}: OfferListProps) {
  if (isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <OfferCardSkeleton key={i} variant="horizontal" />
        ))}
      </div>
    )
  }

  if (offers.length === 0) {
    return <OfferEmptyState />
  }

  return (
    <div className={cn("space-y-4", className)}>
      {offers.map((offer) => (
        <OfferCard key={offer.id} offer={offer} onClick={onOfferClick} />
      ))}
    </div>
  )
}

function OfferEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
        <ShoppingBag className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">Ingen tilbud funnet</h3>
      <p className="text-sm text-muted-foreground mt-1">Prøv å justere filteret</p>
    </div>
  )
}
