'use client';

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface Offer {
  id: string
  title: string
  description?: string
  price: number
  originalPrice?: number
  currency: string
  imageUrl: string
  store: string
  storeLogo?: string
  category?: string
  validUntil?: string
  quantity?: string
}

interface OfferCardProps {
  offer: Offer
  onClick?: (offer: Offer) => void
  className?: string
}

export function OfferCard({ offer, onClick, className }: OfferCardProps) {
  const discount = offer.originalPrice
    ? Math.round(((offer.originalPrice - offer.price) / offer.originalPrice) * 100)
    : null

  return (
    <Card
      className={cn(
        "cursor-pointer overflow-hidden rounded-xl border border-zinc-200 bg-white p-0 transition-all hover:shadow-md hover:scale-105",
        className
      )}
      onClick={() => onClick?.(offer)}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-zinc-50">
        <img
          src={offer.imageUrl || "/placeholder.svg"}
          alt={offer.title}
          className="h-full w-full object-cover"
        />
        {discount && discount > 0 && (
          <Badge className="absolute left-2 top-2 rounded bg-red-500 text-white border-0 font-semibold text-xs px-2 py-0.5">
            -{discount}%
          </Badge>
        )}
        {offer.storeLogo && (
          <div className="absolute right-2 top-2 h-7 w-7 overflow-hidden rounded-full bg-white shadow-sm">
            <img
              src={offer.storeLogo || "/placeholder.svg"}
              alt={offer.store}
              className="h-full w-full object-contain p-1"
            />
          </div>
        )}
      </div>
      
      <CardContent className="p-3 flex flex-col h-28">
        <h3 className="font-medium text-zinc-900 line-clamp-2 text-sm leading-tight flex-1 capitalize">
          {offer.title.toLowerCase()}
        </h3>
        
        <div className="flex items-end justify-between mt-auto">
          <div className="flex flex-col">
            {offer.originalPrice && (
              <span className="text-xs text-zinc-400 line-through leading-tight">
                {offer.originalPrice} {offer.currency === 'NOK' ? 'kr' : offer.currency}
              </span>
            )}
            <div className="flex items-baseline gap-0.5">
              <span className="text-lg font-bold text-zinc-900">
                {offer.price}
              </span>
              <span className="text-sm text-zinc-500">{offer.currency === 'NOK' ? 'kr' : offer.currency}</span>
            </div>
          </div>
          {offer.quantity && (
            <span className="text-xs text-zinc-500">
              {offer.quantity}
            </span>
          )}
        </div>
        {offer.category && <p className="mt-2 text-xs text-zinc-500">{offer.category}</p>}
      </CardContent>
    </Card>
  )
}
